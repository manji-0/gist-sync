import * as vscode from "vscode";
import {
  formatGistError,
  gistFilenameForUri,
  GistService,
  mappingFromGistResponse,
  preserveMappingFlags,
} from "./gistService";
import { GistApiError, GistMapping } from "./types";
import { parseGistId } from "./gistUrl";
import { isMarkdownUri } from "./markdownUri";
import { mappingAfterLocalRename } from "./renameMapping";
import { StatusBar } from "./statusBar";
import {
  SyncState,
  updateHasGistContext,
  updateSyncModeContext,
} from "./syncState";

export class SyncManager implements vscode.Disposable {
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly gist: GistService,
    private readonly syncState: SyncState,
    private readonly statusBar: StatusBar
  ) {}

  refreshUi(uri?: vscode.Uri): void {
    const active = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!active || active.scheme !== "file") {
      this.statusBar.hide();
      updateSyncModeContext(undefined, this.syncState);
      updateHasGistContext(undefined, this.syncState);
      return;
    }
    if (!isMarkdownUri(active)) {
      this.statusBar.hide();
      return;
    }
    this.statusBar.showForMarkdown(active, this.syncState);
    updateSyncModeContext(active, this.syncState);
    updateHasGistContext(active, this.syncState);
  }

  async toggleSyncMode(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }

    const enabled = await this.syncState.toggleSync(target);
    this.refreshUi(target);

    if (enabled) {
      const authenticated = await this.gist.ensureAuthenticated();
      if (!authenticated) {
        await this.syncState.setSyncEnabled(target, false);
        this.refreshUi(target);
        return;
      }
      void vscode.window.showInformationMessage(
        "Gist Sync enabled for this file. Changes will sync on save."
      );
      await this.syncDocument(target, { immediate: true });
    } else {
      void vscode.window.showInformationMessage("Gist Sync disabled for this file.");
    }
  }

  async syncNow(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }
    await this.syncDocument(target, { immediate: true, force: true });
  }

  async openGist(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }
    const mapping = this.syncState.getMapping(target);
    if (!mapping) {
      void vscode.window.showWarningMessage("No Gist linked to this file yet.");
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(mapping.gistUrl));
  }

  async copyGistUrl(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }
    const mapping = this.syncState.getMapping(target);
    if (!mapping) {
      void vscode.window.showWarningMessage("No Gist linked to this file yet.");
      return;
    }

    const rawUrl = mapping.rawUrl;

    const items: Array<{ label: string; description: string; url: string }> = [
      {
        label: "Gist page URL",
        description: mapping.gistUrl,
        url: mapping.gistUrl,
      },
    ];
    if (rawUrl) {
      items.push({
        label: "Raw file URL",
        description: rawUrl,
        url: rawUrl,
      });
    }

    let urlToCopy = mapping.gistUrl;
    if (items.length > 1) {
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select URL to copy",
      });
      if (!picked) {
        return;
      }
      urlToCopy = picked.url;
    }

    await vscode.env.clipboard.writeText(urlToCopy);
    void vscode.window.showInformationMessage("Copied to clipboard.");
  }

  async linkGist(
    uri?: vscode.Uri,
    options: { overwrite?: boolean } = {}
  ): Promise<void> {
    const overwrite = options.overwrite ?? false;
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }

    const authenticated = await this.gist.ensureAuthenticated();
    if (!authenticated) {
      return;
    }

    const input = await vscode.window.showInputBox({
      prompt: overwrite
        ? "Paste Gist URL or ID — syncs to the local file name and overwrites if present"
        : "Paste an existing Gist URL or ID to link this file",
      placeHolder: "https://gist.github.com/username/abc123...",
      ignoreFocusOut: true,
    });
    if (!input?.trim()) {
      return;
    }

    const gistId = parseGistId(input.trim());
    if (!gistId) {
      void vscode.window.showErrorMessage("Invalid Gist URL or ID.");
      return;
    }

    try {
      const gistData = await this.gist.getGist(gistId);
      const fileNames = Object.keys(gistData.files);
      if (!overwrite && fileNames.length === 0) {
        void vscode.window.showErrorMessage("That Gist has no files.");
        return;
      }

      const localName = gistFilenameForUri(target);
      let filename: string | undefined;

      if (overwrite) {
        filename = localName;
      } else if (fileNames.length === 1) {
        filename = fileNames[0];
      } else if (fileNames.includes(localName)) {
        filename = localName;
      } else if (fileNames.length === 0) {
        filename = localName;
      } else {
        const picked = await vscode.window.showQuickPick(
          fileNames.map((name) => ({
            label: name,
            description:
              name === localName ? "matches local file name" : undefined,
          })),
          { placeHolder: "Select the Gist file to sync into" }
        );
        filename = picked?.label;
      }

      if (!filename) {
        return;
      }

      const existsInGist = Boolean(gistData.files[filename]);
      try {
        await this.persistMapping(
          target,
          mappingFromGistResponse(gistData, filename, { overwrite })
        );
      } catch (error) {
        const message = formatGistError(error);
        void vscode.window.showErrorMessage(`Failed to link Gist: ${message}`);
        return;
      }
      this.refreshUi(target);

      const linkedMessage = overwrite
        ? existsInGist
          ? `Linked to Gist (overwrite "${filename}").`
          : `Linked to Gist (will create "${filename}" on sync).`
        : `Linked to Gist file "${filename}".`;

      const choice = await vscode.window.showInformationMessage(
        linkedMessage,
        "Sync Now",
        "Copy URL",
        "Done"
      );
      if (choice === "Sync Now") {
        await this.syncDocument(target, { force: true });
      } else if (choice === "Copy URL") {
        await this.copyGistUrl(target);
      }
    } catch (error) {
      const message = formatGistError(error);
      void vscode.window.showErrorMessage(`Failed to link Gist: ${message}`);
    }
  }

  async linkGistOverwrite(uri?: vscode.Uri): Promise<void> {
    await this.linkGist(uri, { overwrite: true });
  }

  async unlinkGist(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }
    const mapping = this.syncState.getMapping(target);
    if (!mapping) {
      void vscode.window.showWarningMessage("No Gist linked to this file.");
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Unlink Gist "${mapping.filename}" from this file? The Gist itself will not be deleted.`,
      { modal: true },
      "Unlink"
    );
    if (confirm !== "Unlink") {
      return;
    }

    await this.syncState.clearMapping(target);
    this.refreshUi(target);
    void vscode.window.showInformationMessage("Gist link removed.");
  }

  handleFileRename(event: vscode.FileRenameEvent): void {
    void this.processFileRenames(event);
  }

  private async processFileRenames(
    event: vscode.FileRenameEvent
  ): Promise<void> {
    for (const { oldUri, newUri } of event.files) {
      if (
        oldUri.scheme !== "file" ||
        newUri.scheme !== "file" ||
        !isMarkdownUri(oldUri) ||
        !isMarkdownUri(newUri)
      ) {
        continue;
      }

      const mapping = this.syncState.getMapping(oldUri);
      const enabled = this.syncState.isSyncEnabled(oldUri);
      const oldLocalName = gistFilenameForUri(oldUri);
      const newLocalName = gistFilenameForUri(newUri);

      const nextMapping = mapping
        ? mappingAfterLocalRename(mapping, oldLocalName, newLocalName)
        : undefined;

      await this.syncState.migrateFile(oldUri, newUri);

      if (nextMapping) {
        try {
          await this.persistMapping(newUri, nextMapping);
        } catch (error) {
          const message = formatGistError(error);
          void vscode.window.showErrorMessage(
            `Failed to migrate Gist link after rename: ${message}`
          );
        }
      }

      this.refreshUi(newUri);

      if (enabled) {
        await this.syncDocument(newUri, { force: true });
      }
    }
  }

  handleDocumentSave(document: vscode.TextDocument): void {
    if (document.languageId !== "markdown" || !isMarkdownUri(document.uri)) {
      return;
    }
    if (!this.syncState.isSyncEnabled(document.uri)) {
      return;
    }

    const config = vscode.workspace.getConfiguration("gistSync");
    if (!config.get<boolean>("syncOnSave", true)) {
      return;
    }

    const debounceMs = config.get<number>("debounceMs", 500);
    const key = document.uri.toString();

    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pending.delete(key);
      void this.syncDocument(document.uri);
    }, debounceMs);

    this.pending.set(key, timer);
  }

  private resolveMarkdownUri(uri?: vscode.Uri): vscode.Uri | undefined {
    const target =
      uri ??
      vscode.window.activeTextEditor?.document.uri ??
      (vscode.window.tabGroups.activeTabGroup.activeTab?.input as
        | { uri?: vscode.Uri }
        | undefined)?.uri;

    if (!target || target.scheme !== "file") {
      void vscode.window.showWarningMessage("Open a Markdown file on disk first.");
      return undefined;
    }
    if (!isMarkdownUri(target)) {
      void vscode.window.showWarningMessage("Gist Sync only supports Markdown (.md) files.");
      return undefined;
    }
    return target;
  }

  private async persistMapping(
    uri: vscode.Uri,
    mapping: GistMapping
  ): Promise<void> {
    await this.syncState.setMapping(uri, mapping);
  }

  private async assertRenameTargetAvailable(
    gistId: string,
    writeFilename: string,
    removeFilename: string | undefined,
    allowOverwrite: boolean
  ): Promise<void> {
    if (
      allowOverwrite ||
      !removeFilename ||
      removeFilename === writeFilename
    ) {
      return;
    }

    const gistData = await this.gist.getGist(gistId);
    if (gistData.files[writeFilename]) {
      throw new GistApiError(
        `Gist already contains "${writeFilename}". Use "Link to Gist (Overwrite)" or rename the local file.`,
        409
      );
    }
  }

  private async syncDocument(
    uri: vscode.Uri,
    options: { immediate?: boolean; force?: boolean } = {}
  ): Promise<void> {
    const key = uri.toString();
    if (this.inFlight.has(key)) {
      return;
    }

    if (!options.force && !this.syncState.isSyncEnabled(uri)) {
      return;
    }

    const doc =
      vscode.workspace.textDocuments.find((d) => d.uri.toString() === key) ??
      (await vscode.workspace.openTextDocument(uri));

    const content = doc.getText();
    const filename = gistFilenameForUri(uri);
    const config = vscode.workspace.getConfiguration("gistSync");
    const description =
      config.get<string>("gistDescription")?.trim() || filename;
    const isPublic = config.get<boolean>("gistPublic", false);

    this.inFlight.add(key);
    this.statusBar.showSyncing();

    try {
      const existing = this.syncState.getMapping(uri);
      let mapping;

      if (existing) {
        const writeFilename = existing.filename;
        const removeFilename = existing.replacesFilename;

        if (removeFilename && removeFilename !== writeFilename) {
          await this.assertRenameTargetAvailable(
            existing.gistId,
            writeFilename,
            removeFilename,
            existing.overwrite === true
          );
        }

        const updated =
          removeFilename && removeFilename !== writeFilename
            ? await this.gist.renameGistFile(
                existing.gistId,
                removeFilename,
                writeFilename,
                content
              )
            : await this.gist.updateGist(
                existing.gistId,
                writeFilename,
                content
              );

        mapping = preserveMappingFlags(
          mappingFromGistResponse(updated, writeFilename, {
            overwrite: existing.overwrite,
          }),
          existing
        );
      } else {
        const created = await this.gist.createGist(
          filename,
          content,
          description,
          isPublic
        );
        mapping = mappingFromGistResponse(created, filename);
      }

      await this.persistMapping(uri, mapping);
      this.refreshUi(uri);
    } catch (error) {
      const message = formatGistError(error);
      this.statusBar.showError(message);
      void vscode.window.showErrorMessage(`Gist Sync failed: ${message}`);
    } finally {
      this.inFlight.delete(key);
      this.refreshUi(uri);
    }
  }

  dispose(): void {
    for (const timer of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
  }
}
