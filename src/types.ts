export interface GistFile {
  filename: string;
  content: string;
}

export interface GistMapping {
  gistId: string;
  gistUrl: string;
  /** File key in the Gist to read/write. */
  filename: string;
  rawUrl?: string;
  /** Gist file to delete on next sync after a local rename. */
  replacesFilename?: string;
  /** Allow overwriting an existing gist file with the same name. */
  overwrite?: boolean;
  lastSyncedAt: string;
}

export interface GistFileInfo {
  filename: string;
  raw_url?: string;
}

export interface GistGetResponse {
  id: string;
  html_url: string;
  files: Record<string, GistFileInfo>;
}

export interface GistCreateResponse {
  id: string;
  html_url: string;
  files: Record<string, GistFileInfo>;
}

export interface GistUpdateResponse {
  id: string;
  html_url: string;
  files: Record<string, GistFileInfo>;
}

export class GistApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "GistApiError";
  }
}

export class GistMappingConflictError extends Error {
  constructor(
    readonly gistId: string,
    readonly filename: string,
    readonly existingUri: string
  ) {
    super(
      `Gist file "${filename}" is already linked from another local file.`
    );
    this.name = "GistMappingConflictError";
  }
}
