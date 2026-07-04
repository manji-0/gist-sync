import * as vscode from "vscode";
import { createVscodeAuthPort } from "./infrastructure/vscode/auth-port";
import { GITHUB_AUTH_PROVIDER } from "./infrastructure/vscode/github-auth-constants";
import { migrateLegacyFileLinks } from "./infrastructure/vscode/legacy-mapping-migration";
import { createSyncStateStore } from "./infrastructure/vscode/sync-state-store";
import { StatusBar } from "./presentation/status-bar";
import { SyncManager } from "./presentation/sync-manager";

type ExtensionRuntime = Readonly<{
  auth: ReturnType<typeof createVscodeAuthPort>;
  syncManager: SyncManager;
  statusBar: StatusBar;
}>;

const bootstrap = async (
  context: vscode.ExtensionContext
): Promise<ExtensionRuntime> => {
  const auth = createVscodeAuthPort(context);
  void auth.migratePatFromConfig();
  await migrateLegacyFileLinks(context.globalState);

  const store = createSyncStateStore(context.globalState);
  const statusBar = new StatusBar();
  const syncManager = new SyncManager({ auth, store }, statusBar);
  syncManager.refreshUi();

  return { auth, syncManager, statusBar };
};

export function activate(context: vscode.ExtensionContext): void {
  let runtime: ExtensionRuntime | undefined;
  const ready = bootstrap(context)
    .then((value) => {
      runtime = value;
      return value;
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Unknown activation error";
      void vscode.window.showErrorMessage(`Gist Sync failed to activate: ${message}`);
      throw error;
    });

  const whenReady = async <T>(run: (rt: ExtensionRuntime) => Promise<T> | T) => {
    const rt = runtime ?? (await ready);
    return run(rt);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("gistSync.toggleSyncMode", (uri?: vscode.Uri) =>
      whenReady(({ syncManager }) => syncManager.toggleSyncMode(uri))
    ),
    vscode.commands.registerCommand("gistSync.syncNow", (uri?: vscode.Uri) =>
      whenReady(({ syncManager }) => syncManager.syncNow(uri))
    ),
    vscode.commands.registerCommand("gistSync.openGist", (uri?: vscode.Uri) =>
      whenReady(({ syncManager }) => syncManager.openGist(uri))
    ),
    vscode.commands.registerCommand("gistSync.copyGistUrl", (uri?: vscode.Uri) =>
      whenReady(({ syncManager }) => syncManager.copyGistUrl(uri))
    ),
    vscode.commands.registerCommand("gistSync.linkGist", (uri?: vscode.Uri) =>
      whenReady(({ syncManager }) => syncManager.linkGist(uri))
    ),
    vscode.commands.registerCommand(
      "gistSync.linkGistOverwrite",
      (uri?: vscode.Uri) => whenReady(({ syncManager }) => syncManager.linkGistOverwrite(uri))
    ),
    vscode.commands.registerCommand("gistSync.unlinkGist", (uri?: vscode.Uri) =>
      whenReady(({ syncManager }) => syncManager.unlinkGist(uri))
    ),
    vscode.commands.registerCommand("gistSync.signIn", () =>
      whenReady(async ({ auth, syncManager }) => {
        const ok = await auth.signIn();
        if (!ok) {
          void vscode.window.showWarningMessage(
            "GitHub sign-in was cancelled or the GitHub authentication provider is unavailable."
          );
        }
        syncManager.refreshUi();
      })
    ),
    vscode.commands.registerCommand("gistSync.setToken", () =>
      whenReady(async ({ auth, syncManager }) => {
        const ok = await auth.promptForPat();
        if (ok) {
          syncManager.refreshUi();
        }
      })
    ),
    vscode.commands.registerCommand("gistSync.clearToken", () =>
      whenReady(async ({ auth, syncManager }) => {
        await auth.clearPatToken();
        void vscode.window.showInformationMessage("Saved Personal Access Token cleared.");
        syncManager.refreshUi();
      })
    )
  );

  void ready.then((rt) => {
    context.subscriptions.push(
      rt.statusBar,
      vscode.authentication.onDidChangeSessions((e) => {
        if (e.provider.id === GITHUB_AUTH_PROVIDER) {
          rt.syncManager.refreshUi();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => rt.syncManager.refreshUi()),
      vscode.workspace.onDidSaveTextDocument((doc) =>
        rt.syncManager.handleDocumentSave(doc)
      ),
      vscode.workspace.onDidRenameFiles((event) =>
        rt.syncManager.handleFileRename(event)
      ),
      rt.syncManager
    );
  });
}

export function deactivate(): void {}
