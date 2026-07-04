import * as vscode from "vscode";
import { Sensitive } from "../../boundary/sensitive";
import { readGistSyncConfig } from "./gist-sync-config";
import { GITHUB_AUTH_PROVIDER, GIST_SCOPES } from "./github-auth-constants";

export type AuthMethod = "auto" | "oauth" | "pat";

export type AuthPort = Readonly<{
  migratePatFromConfig: () => Promise<void>;
  ensureAuthenticated: () => Promise<boolean>;
  signIn: () => Promise<boolean>;
  getToken: (interactive: boolean) => Promise<Sensitive<string> | undefined>;
  setPatToken: (token: string) => Promise<void>;
  clearPatToken: () => Promise<void>;
  promptForPat: () => Promise<boolean>;
}>;

const hasGetProviderIds = (
  auth: typeof vscode.authentication
): auth is typeof vscode.authentication & {
  getProviderIds: () => readonly string[];
} =>
  "getProviderIds" in auth &&
  typeof auth.getProviderIds === "function";

const wrapToken = (token: string | undefined): Sensitive<string> | undefined =>
  token ? Sensitive.of(token) : undefined;

export const createVscodeAuthPort = (
  context: vscode.ExtensionContext
): AuthPort => {
  const getAuthMethod = (): AuthMethod => readGistSyncConfig().authMethod;

  const isOAuthProviderAvailable = (): boolean => {
    const auth = vscode.authentication;
    if (!hasGetProviderIds(auth)) {
      return true;
    }
    return auth.getProviderIds().includes(GITHUB_AUTH_PROVIDER);
  };

  const getSession = async (
    interactive: boolean
  ): Promise<vscode.AuthenticationSession | undefined> => {
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
  };

  const getOAuthToken = async (
    interactive: boolean
  ): Promise<string | undefined> => {
    try {
      const session = await getSession(interactive);
      return session?.accessToken;
    } catch {
      return undefined;
    }
  };

  const getPatToken = async (): Promise<string | undefined> =>
    (await context.secrets.get("gistSync.githubToken")) || undefined;

  const getToken = async (
    interactive: boolean
  ): Promise<Sensitive<string> | undefined> => {
    const method = getAuthMethod();

    if (method === "pat") {
      return wrapToken(await getPatToken());
    }

    if (method === "oauth") {
      return wrapToken(await getOAuthToken(interactive));
    }

    return wrapToken(
      (await getOAuthToken(interactive)) ?? (await getPatToken())
    );
  };

  const promptForPat = async (): Promise<boolean> => {
    const token = await vscode.window.showInputBox({
      prompt: "GitHub Personal Access Token (gist scope required)",
      password: true,
      ignoreFocusOut: true,
      placeHolder: "ghp_...",
    });
    if (!token?.trim()) {
      return false;
    }
    await context.secrets.store("gistSync.githubToken", token.trim());
    void vscode.window.showInformationMessage("GitHub token saved securely.");
    return true;
  };

  return {
    migratePatFromConfig: async () => {
      const fromConfig = vscode.workspace
        .getConfiguration("gistSync")
        .get<string>("githubToken")
        ?.trim();
      if (!fromConfig) {
        return;
      }

      const existing = await context.secrets.get("gistSync.githubToken");
      if (!existing) {
        await context.secrets.store("gistSync.githubToken", fromConfig);
      }

      void vscode.window.showWarningMessage(
        "gistSync.githubToken in settings is deprecated. Your token was copied to secure storage — remove it from settings.json."
      );
    },

    getToken,

    ensureAuthenticated: async () => {
      if (await getToken(false)) {
        return true;
      }

      const method = getAuthMethod();
      if (method === "pat") {
        return promptForPat();
      }

      if (method === "oauth" && !isOAuthProviderAvailable()) {
        void vscode.window.showWarningMessage(
          "GitHub authentication provider is unavailable in this editor."
        );
        return false;
      }

      if (await getOAuthToken(true)) {
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
      return choice === "Enter Token" ? promptForPat() : false;
    },

    signIn: async () => {
      if (!isOAuthProviderAvailable()) {
        void vscode.window.showWarningMessage(
          "GitHub authentication provider is unavailable in this editor."
        );
        return false;
      }

      try {
        const token = await getOAuthToken(true);
        if (!token) {
          return false;
        }
        const session = await getSession(false);
        const label = session?.account.label ?? "GitHub";
        void vscode.window.showInformationMessage(
          `Signed in to GitHub as ${label}.`
        );
        return true;
      } catch {
        return false;
      }
    },

    setPatToken: async (token: string) => {
      await context.secrets.store("gistSync.githubToken", token);
    },

    clearPatToken: async () => {
      await context.secrets.delete("gistSync.githubToken");
    },

    promptForPat,
  };
};
