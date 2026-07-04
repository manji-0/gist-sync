import * as vscode from "vscode";
import { GitHubAuth } from "./githubAuth";
import {
  GistApiError,
  GistCreateResponse,
  GistGetResponse,
  GistMapping,
  GistMappingConflictError,
  GistUpdateResponse,
} from "./types";
import { rawUrlFromGistFile } from "./gistUrl";
import { assertGistResponse } from "./gistValidate";

const GITHUB_API = "https://api.github.com";

export class GistService {
  readonly auth: GitHubAuth;

  constructor(context: vscode.ExtensionContext) {
    this.auth = new GitHubAuth(context);
  }

  async getToken(options?: { interactive?: boolean }): Promise<string | undefined> {
    return this.auth.getToken(options);
  }

  async ensureAuthenticated(): Promise<boolean> {
    return this.auth.ensureAuthenticated();
  }

  async setToken(token: string): Promise<void> {
    await this.auth.setPatToken(token);
  }

  async clearToken(): Promise<void> {
    await this.auth.clearPatToken();
  }

  async createGist(
    filename: string,
    content: string,
    description: string,
    isPublic: boolean
  ): Promise<GistCreateResponse> {
    const token = await this.requireToken();
    const response = await this.request<GistCreateResponse>("/gists", {
      method: "POST",
      token,
      body: {
        description,
        public: isPublic,
        files: {
          [filename]: { content },
        },
      },
    });
    return response;
  }

  async updateGist(
    gistId: string,
    filename: string,
    content: string
  ): Promise<GistUpdateResponse> {
    return this.patchGistFiles(gistId, {
      [filename]: { content },
    });
  }

  async patchGistFiles(
    gistId: string,
    files: Record<string, { content: string } | null>
  ): Promise<GistUpdateResponse> {
    const token = await this.requireToken();
    return this.request<GistUpdateResponse>(`/gists/${gistId}`, {
      method: "PATCH",
      token,
      body: { files },
    });
  }

  async renameGistFile(
    gistId: string,
    fromFilename: string,
    toFilename: string,
    content: string
  ): Promise<GistUpdateResponse> {
    const files: Record<string, { content: string } | null> = {
      [toFilename]: { content },
    };
    if (fromFilename !== toFilename) {
      files[fromFilename] = null;
    }
    return this.patchGistFiles(gistId, files);
  }

  async getGist(gistId: string): Promise<GistGetResponse> {
    const token = await this.requireToken();
    return this.request<GistGetResponse>(`/gists/${gistId}`, {
      method: "GET",
      token,
    });
  }

  async deleteGistFile(gistId: string, filename: string): Promise<void> {
    await this.patchGistFiles(gistId, {
      [filename]: null,
    });
  }

  private async requireToken(): Promise<string> {
    const token = await this.getToken({ interactive: true });
    if (!token) {
      throw new GistApiError(
        "Not signed in to GitHub. Run 'Gist Sync: Sign in to GitHub' or set a token.",
        401
      );
    }
    return token;
  }

  private async request<T>(
    path: string,
    options: {
      method: string;
      token: string;
      body?: unknown;
    }
  ): Promise<T> {
    const response = await fetch(`${GITHUB_API}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "gist-sync-vscode-extension",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new GistApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
        text
      );
    }

    if (!text) {
      throw new GistApiError("Empty GitHub API response", 502);
    }
    return assertGistResponse(JSON.parse(text)) as T;
  }
}

export function gistFilenameForUri(uri: vscode.Uri): string {
  const base = uri.path.split("/").pop() ?? "note.md";
  return base.endsWith(".md") ? base : `${base}.md`;
}

export function buildMapping(
  gistId: string,
  gistUrl: string,
  filename: string,
  rawUrl?: string,
  options?: { overwrite?: boolean }
): GistMapping {
  return {
    gistId,
    gistUrl,
    filename,
    rawUrl,
    overwrite: options?.overwrite || undefined,
    lastSyncedAt: new Date().toISOString(),
  };
}

export function mappingFromGistResponse(
  response: GistCreateResponse | GistUpdateResponse | GistGetResponse,
  filename: string,
  options?: { overwrite?: boolean }
): GistMapping {
  const file = response.files[filename];
  return buildMapping(
    response.id,
    response.html_url,
    filename,
    rawUrlFromGistFile(file?.raw_url),
    options
  );
}

export function preserveMappingFlags(
  mapping: GistMapping,
  prior?: GistMapping
): GistMapping {
  if (!prior) {
    return mapping;
  }
  return {
    ...mapping,
    overwrite: prior.overwrite,
  };
}

export function formatGistError(error: unknown): string {
  if (error instanceof GistApiError) {
    if (error.status === 401 || error.status === 403) {
      return "Authentication failed. Sign in to GitHub or check your token has gist scope.";
    }
    if (error.status === 404) {
      return "Gist not found. It may have been deleted — sync again to create a new one.";
    }
    if (error.status === 409) {
      return error.message;
    }
    return error.message;
  }
  if (error instanceof GistMappingConflictError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
