import * as vscode from "vscode";
import { GistId } from "../domain/gist-id";
import { GistFilename } from "../domain/gist-filename";
import { GistResponse } from "../boundary/gist-response-schema";
import { formatSyncError } from "../application/format-sync-error";
import { createLinkFileToGist, type LinkMode } from "../application/link-file-to-gist";
import { createSyncFileUseCase } from "../application/sync-file";
import { applyLocalRename } from "../domain/file-link-rename";
import { createGistClient } from "../infrastructure/github/gist-client";
import type { AuthPort } from "../infrastructure/vscode/auth-port";
import { readGistSyncConfig } from "../infrastructure/vscode/gist-sync-config";
import { isMarkdownUri } from "../infrastructure/vscode/markdown-uri";
import type { SyncStateStore } from "../infrastructure/vscode/sync-state-store";
import { StatusBar } from "./status-bar";

export type SyncManagerDeps = Readonly<{
  auth: AuthPort;
  store: SyncStateStore;
}>;

export class SyncManager implements vscode.Disposable {
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlight = new Set<string>();
  private readonly syncFile;
  private readonly linkFile;

  constructor(
    private readonly deps: SyncManagerDeps,
    private readonly statusBar: StatusBar,
  ) {
    const client = createGistClient(deps.auth.getToken);
    this.syncFile = createSyncFileUseCase(deps.auth.getToken);
    this.linkFile = createLinkFileToGist(client);
  }

  refreshUi(uri?: vscode.Uri): void {
    const active = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!active || !isMarkdownUri(active)) {
      this.statusBar.hide();
      void this.setContext("gistSync.syncEnabled", false);
      void this.setContext("gistSync.hasGist", false);
      return;
    }

    const key = active.toString();
    this.statusBar.showForMarkdown(key, this.deps.store);
    void this.setContext("gistSync.syncEnabled", this.deps.store.isSyncEnabled(key));
    void this.setContext("gistSync.hasGist", Boolean(this.deps.store.getLink(key)));
  }

  async toggleSyncMode(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }

    const key = target.toString();
    const enabled = await this.deps.store.toggleSync(key);
    this.refreshUi(target);

    if (!enabled) {
      void vscode.window.showInformationMessage("Gist Sync disabled for this file.");
      return;
    }

    if (!(await this.deps.auth.ensureAuthenticated())) {
      await this.deps.store.setSyncEnabled(key, false);
      this.refreshUi(target);
      return;
    }

    void vscode.window.showInformationMessage(
      "Gist Sync enabled for this file. Changes will sync on save.",
    );
    await this.syncDocument(target, { force: true });
  }

  async enableSync(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }

    const key = target.toString();
    if (this.deps.store.isSyncEnabled(key)) {
      return;
    }

    const picked = await vscode.window.showQuickPick(
      [
        {
          label: "$(add) Create new Gist",
          description: "Create a new Gist from this file",
          mode: "new" as const,
        },
        {
          label: "$(link) Link existing Gist",
          description: "Paste a Gist URL or ID",
          mode: "link" as const,
        },
      ],
      {
        title: "Enable Gist Sync",
        placeHolder: "Choose how to sync this file",
      },
    );
    if (!picked) {
      return;
    }

    if (!(await this.deps.auth.ensureAuthenticated())) {
      return;
    }

    if (picked.mode === "new") {
      await this.deps.store.setSyncEnabled(key, true);
      this.refreshUi(target);
      void vscode.window.showInformationMessage("Gist Sync enabled. Creating Gist...");
      await this.syncDocument(target, { force: true });
      return;
    }

    const hadLink = Boolean(this.deps.store.getLink(key));
    await this.linkGist(target, "select");
    if (!hadLink && this.deps.store.getLink(key)) {
      await this.deps.store.setSyncEnabled(key, true);
      this.refreshUi(target);
    }
  }

  async syncNow(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (target) {
      await this.syncDocument(target, { force: true });
    }
  }

  async openGist(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }
    const link = this.deps.store.getLink(target.toString());
    if (!link) {
      void vscode.window.showWarningMessage("No Gist linked to this file yet.");
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(link.gistUrl));
  }

  async copyGistUrl(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }
    const link = this.deps.store.getLink(target.toString());
    if (!link) {
      void vscode.window.showWarningMessage("No Gist linked to this file yet.");
      return;
    }

    const items = [
      {
        label: "Gist page URL",
        description: link.gistUrl,
        url: link.gistUrl,
      },
    ];
    if (link.rawUrl) {
      items.push({
        label: "Raw file URL",
        description: link.rawUrl,
        url: link.rawUrl,
      });
    }

    let urlToCopy = link.gistUrl;
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

  async linkGist(uri?: vscode.Uri, mode: LinkMode = "select"): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }

    if (!(await this.deps.auth.ensureAuthenticated())) {
      return;
    }

    const input = await vscode.window.showInputBox({
      prompt:
        mode === "overwrite"
          ? "Paste Gist URL or ID — syncs to the local file name and overwrites if present"
          : "Paste an existing Gist URL or ID to link this file",
      placeHolder: "https://gist.github.com/username/abc123...",
      ignoreFocusOut: true,
    });
    if (!input?.trim()) {
      return;
    }

    const gistIdResult = GistId.parseFromUrl(input.trim());
    if (gistIdResult.isErr()) {
      void vscode.window.showErrorMessage("Invalid Gist URL or ID.");
      return;
    }

    const localFilename = this.localFilenameFromPath(target.fsPath);
    if (!localFilename) {
      return;
    }
    let selectedFilename: GistFilename | undefined;
    let gistResponse: import("../boundary/gist-response-schema").GistResponse | undefined;

    if (mode === "select") {
      const client = createGistClient(this.deps.auth.getToken);
      const gistResult = await client.getGist(gistIdResult.value);
      if (gistResult.isErr()) {
        void vscode.window.showErrorMessage(
          `Failed to link Gist: ${formatSyncError(gistResult.error)}`,
        );
        return;
      }

      gistResponse = gistResult.value;
      const names = GistResponse.filenames(gistResponse);
      if (names.length === 0) {
        void vscode.window.showErrorMessage("That Gist has no files.");
        return;
      }

      if (names.length === 1) {
        selectedFilename = names[0];
      } else if (names.includes(localFilename)) {
        selectedFilename = localFilename;
      } else {
        const picked = await vscode.window.showQuickPick(
          names.map((name) => ({ label: name })),
          { placeHolder: "Select the Gist file to sync into" },
        );
        if (!picked?.label) {
          return;
        }
        const parsed = GistFilename.parse(picked.label);
        if (parsed.isErr()) {
          return;
        }
        selectedFilename = parsed.value;
      }
    }

    const result = await this.linkFile.execute({
      gistIdRaw: input.trim(),
      localFilename,
      mode,
      selectedFilename,
      gistResponse,
    });

    await result.match(
      async ({ link, gist }) => {
        const saved = await this.deps.store.setLink(target.toString(), link);
        if (saved.isErr()) {
          void vscode.window.showErrorMessage(
            `Failed to link Gist: ${formatSyncError(saved.error)}`,
          );
          return;
        }

        this.refreshUi(target);

        const exists = mode === "overwrite" && Boolean(gist.files[link.filename]);

        const message =
          mode === "overwrite"
            ? exists
              ? `Linked to Gist (overwrite "${link.filename}").`
              : `Linked to Gist (will create "${link.filename}" on sync).`
            : `Linked to Gist file "${link.filename}".`;

        const choice = await vscode.window.showInformationMessage(
          message,
          "Sync Now",
          "Copy URL",
          "Done",
        );
        if (choice === "Sync Now") {
          await this.syncDocument(target, { force: true });
        } else if (choice === "Copy URL") {
          await this.copyGistUrl(target);
        }
      },
      async (error) => {
        void vscode.window.showErrorMessage(`Failed to link Gist: ${formatSyncError(error)}`);
      },
    );
  }

  async linkGistOverwrite(uri?: vscode.Uri): Promise<void> {
    await this.linkGist(uri, "overwrite");
  }

  async unlinkGist(uri?: vscode.Uri): Promise<void> {
    const target = this.resolveMarkdownUri(uri);
    if (!target) {
      return;
    }
    const link = this.deps.store.getLink(target.toString());
    if (!link) {
      void vscode.window.showWarningMessage("No Gist linked to this file.");
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Unlink Gist "${link.filename}" from this file? The Gist itself will not be deleted.`,
      { modal: true },
      "Unlink",
    );
    if (confirm !== "Unlink") {
      return;
    }

    await this.deps.store.clearLink(target.toString());
    this.refreshUi(target);
    void vscode.window.showInformationMessage("Gist link removed.");
  }

  handleFileRename(event: vscode.FileRenameEvent): void {
    void this.processFileRenames(event);
  }

  private async processFileRenames(event: vscode.FileRenameEvent): Promise<void> {
    for (const { oldUri, newUri } of event.files) {
      if (!isMarkdownUri(oldUri) || !isMarkdownUri(newUri)) {
        continue;
      }

      const oldKey = oldUri.toString();
      const newKey = newUri.toString();
      const link = this.deps.store.getLink(oldKey);
      const enabled = this.deps.store.isSyncEnabled(oldKey);
      const oldLocal = this.localFilenameFromPath(oldUri.fsPath);
      const newLocal = this.localFilenameFromPath(newUri.fsPath);
      if (!oldLocal || !newLocal) {
        continue;
      }

      await this.deps.store.migrateFile(oldKey, newKey);

      if (link) {
        const next = applyLocalRename(link, oldLocal, newLocal);
        const saved = await this.deps.store.setLink(newKey, next);
        if (saved.isErr()) {
          void vscode.window.showErrorMessage(
            `Failed to migrate Gist link after rename: ${formatSyncError(saved.error)}`,
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

    const key = document.uri.toString();
    if (!this.deps.store.isSyncEnabled(key)) {
      return;
    }

    const config = readGistSyncConfig();
    if (!config.syncOnSave) {
      return;
    }

    const debounceMs = config.debounceMs;
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
    const target = uri ?? vscode.window.activeTextEditor?.document.uri ?? this.uriFromActiveTab();

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

  private async syncDocument(uri: vscode.Uri, options: { force?: boolean } = {}): Promise<void> {
    const key = uri.toString();
    if (this.inFlight.has(key)) {
      return;
    }

    if (!options.force && !this.deps.store.isSyncEnabled(key)) {
      return;
    }

    const doc =
      vscode.workspace.textDocuments.find((d) => d.uri.toString() === key) ??
      (await vscode.workspace.openTextDocument(uri));

    const localFilename = this.localFilenameFromPath(uri.fsPath);
    if (!localFilename) {
      return;
    }
    const config = readGistSyncConfig();
    const description = config.gistDescription.trim() || localFilename;
    const isPublic = config.gistPublic;
    const link = this.deps.store.getLink(key);

    this.inFlight.add(key);
    this.statusBar.showSyncing();

    try {
      const result = await this.syncFile.execute({
        link,
        localFilename,
        content: doc.getText(),
        description,
        isPublic,
      });

      await result.match(
        async (nextLink) => {
          const saved = await this.deps.store.setLink(key, nextLink);
          if (saved.isErr()) {
            const message = formatSyncError(saved.error);
            this.statusBar.showError(message);
            void vscode.window.showErrorMessage(`Gist Sync failed: ${message}`);
            return;
          }
          this.refreshUi(uri);
        },
        async (error) => {
          const message = formatSyncError(error);
          this.statusBar.showError(message);
          void vscode.window.showErrorMessage(`Gist Sync failed: ${message}`);
        },
      );
    } finally {
      this.inFlight.delete(key);
      this.refreshUi(uri);
    }
  }

  private uriFromActiveTab(): vscode.Uri | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (input instanceof vscode.TabInputText) {
      return input.uri;
    }
    if (input instanceof vscode.TabInputCustom) {
      return input.uri;
    }
    return undefined;
  }

  private localFilenameFromPath(
    fsPath: string,
  ): import("../domain/gist-filename").GistFilename | undefined {
    const result = GistFilename.fromLocalPath(fsPath);
    if (result.isErr()) {
      void vscode.window.showErrorMessage(
        "Could not determine a valid Markdown filename for this file.",
      );
      return undefined;
    }
    return result.value;
  }

  private setContext(key: string, value: boolean): Thenable<void> {
    return vscode.commands.executeCommand("setContext", key, value);
  }

  dispose(): void {
    for (const timer of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
  }
}
