import * as vscode from "vscode";
import { GITHUB_AUTH_PROVIDER } from "./githubAuth";
import { GistService } from "./gistService";
import { StatusBar } from "./statusBar";
import { SyncManager } from "./syncManager";
import { SyncState } from "./syncState";

export function activate(context: vscode.ExtensionContext): void {
  const gist = new GistService(context);
  void gist.auth.migratePatFromConfig();
  const syncState = new SyncState(context.globalState);
  const statusBar = new StatusBar();
  const syncManager = new SyncManager(gist, syncState, statusBar);

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand("gistSync.toggleSyncMode", (uri?: vscode.Uri) =>
      syncManager.toggleSyncMode(uri)
    ),
    vscode.commands.registerCommand("gistSync.syncNow", (uri?: vscode.Uri) =>
      syncManager.syncNow(uri)
    ),
    vscode.commands.registerCommand("gistSync.openGist", (uri?: vscode.Uri) =>
      syncManager.openGist(uri)
    ),
    vscode.commands.registerCommand("gistSync.copyGistUrl", (uri?: vscode.Uri) =>
      syncManager.copyGistUrl(uri)
    ),
    vscode.commands.registerCommand("gistSync.linkGist", (uri?: vscode.Uri) =>
      syncManager.linkGist(uri)
    ),
    vscode.commands.registerCommand(
      "gistSync.linkGistOverwrite",
      (uri?: vscode.Uri) => syncManager.linkGistOverwrite(uri)
    ),
    vscode.commands.registerCommand("gistSync.unlinkGist", (uri?: vscode.Uri) =>
      syncManager.unlinkGist(uri)
    ),
    vscode.commands.registerCommand("gistSync.signIn", async () => {
      const ok = await gist.auth.signIn();
      if (!ok) {
        void vscode.window.showWarningMessage(
          "GitHub sign-in was cancelled or the GitHub authentication provider is unavailable."
        );
      }
      syncManager.refreshUi();
    }),
    vscode.commands.registerCommand("gistSync.setToken", async () => {
      const ok = await gist.auth.promptForPat();
      if (ok) {
        syncManager.refreshUi();
      }
    }),
    vscode.commands.registerCommand("gistSync.clearToken", async () => {
      await gist.clearToken();
      void vscode.window.showInformationMessage("Saved Personal Access Token cleared.");
      syncManager.refreshUi();
    }),
    vscode.authentication.onDidChangeSessions((e) => {
      if (e.provider.id === GITHUB_AUTH_PROVIDER) {
        syncManager.refreshUi();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => syncManager.refreshUi()),
    vscode.workspace.onDidSaveTextDocument((doc) =>
      syncManager.handleDocumentSave(doc)
    ),
    vscode.workspace.onDidRenameFiles((event) =>
      syncManager.handleFileRename(event)
    ),
    syncManager
  );

  syncManager.refreshUi();
}

export function deactivate(): void {}
