import * as vscode from "vscode";

export const GITHUB_AUTH_PROVIDER = "github";
export const GIST_SCOPES = ["gist"] as const;

export type AuthMethod = "auto" | "oauth" | "pat";

export class GitHubAuth {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async migratePatFromConfig(): Promise<void> {
    const fromConfig = vscode.workspace
      .getConfiguration("gistSync")
      .get<string>("githubToken")
      ?.trim();
    if (!fromConfig) {
      return;
    }

    const existing = await this.context.secrets.get("gistSync.githubToken");
    if (!existing) {
      await this.context.secrets.store("gistSync.githubToken", fromConfig);
    }

    void vscode.window.showWarningMessage(
      "gistSync.githubToken in settings is deprecated. Your token was copied to secure storage — remove it from settings.json."
    );
  }

  getAuthMethod(): AuthMethod {
    return vscode.workspace
      .getConfiguration("gistSync")
      .get<AuthMethod>("authMethod", "auto");
  }

  async getToken(options: { interactive?: boolean } = {}): Promise<
    string | undefined
  > {
    const method = this.getAuthMethod();
    const interactive = options.interactive ?? false;

    if (method === "pat") {
      return this.getPatToken();
    }

    if (method === "oauth") {
      return this.getOAuthToken(interactive);
    }

    const oauth = await this.getOAuthToken(interactive);
    if (oauth) {
      return oauth;
    }
    return this.getPatToken();
  }

  async ensureAuthenticated(): Promise<boolean> {
    const existing = await this.getToken({ interactive: false });
    if (existing) {
      return true;
    }

    const method = this.getAuthMethod();

    if (method === "pat") {
      return this.promptForPat();
    }

    if (method === "oauth" && !this.isOAuthProviderAvailable()) {
      void vscode.window.showWarningMessage(
        "GitHub authentication provider is unavailable in this editor."
      );
      return false;
    }

    const oauth = await this.getOAuthToken(true);
    if (oauth) {
      return true;
    }

    if (method === "oauth") {
      return false;
    }

    const choice = await vscode.window.showWarningMessage(
      "GitHub sign-in was cancelled or unavailable. Use a Personal Access Token instead?",
      "Enter Token",
      "Cancel"
    );
    if (choice === "Enter Token") {
      return this.promptForPat();
    }
    return false;
  }

  async signIn(): Promise<boolean> {
    if (!this.isOAuthProviderAvailable()) {
      void vscode.window.showWarningMessage(
        "GitHub authentication provider is unavailable in this editor."
      );
      return false;
    }

    try {
      const token = await this.getOAuthToken(true);
      if (token) {
        const session = await this.getSession(false);
        const label = session?.account.label ?? "GitHub";
        void vscode.window.showInformationMessage(
          `Signed in to GitHub as ${label}.`
        );
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  async getSession(
    interactive: boolean
  ): Promise<vscode.AuthenticationSession | undefined> {
    try {
      return await vscode.authentication.getSession(
        GITHUB_AUTH_PROVIDER,
        [...GIST_SCOPES],
        { createIfNone: interactive }
      );
    } catch (error) {
      if (!interactive) {
        return undefined;
      }
      throw error;
    }
  }

  async getOAuthToken(interactive: boolean): Promise<string | undefined> {
    try {
      const session = await this.getSession(interactive);
      return session?.accessToken;
    } catch {
      return undefined;
    }
  }

  async getPatToken(): Promise<string | undefined> {
    return (await this.context.secrets.get("gistSync.githubToken")) || undefined;
  }

  async setPatToken(token: string): Promise<void> {
    await this.context.secrets.store("gistSync.githubToken", token);
  }

  async clearPatToken(): Promise<void> {
    await this.context.secrets.delete("gistSync.githubToken");
  }

  async promptForPat(): Promise<boolean> {
    const token = await vscode.window.showInputBox({
      prompt: "GitHub Personal Access Token (gist scope required)",
      password: true,
      ignoreFocusOut: true,
      placeHolder: "ghp_...",
    });
    if (token?.trim()) {
      await this.setPatToken(token.trim());
      void vscode.window.showInformationMessage("GitHub token saved securely.");
      return true;
    }
    return false;
  }

  isOAuthProviderAvailable(): boolean {
    const getIds = (
      vscode.authentication as { getProviderIds?: () => readonly string[] }
    ).getProviderIds;
    if (getIds) {
      return getIds().includes(GITHUB_AUTH_PROVIDER);
    }
    return true;
  }
}
