import type { GistFilename } from "./gist-filename";
import type { GistId } from "./gist-id";
import type { ValidationError } from "../boundary/schema-result";

export type SyncError =
  | Readonly<{ kind: "NotAuthenticated" }>
  | Readonly<{ kind: "InvalidGistInput" }>
  | Readonly<{ kind: "GistHasNoFiles" }>
  | Readonly<{ kind: "LinkConflict"; gistId: GistId; filename: GistFilename; existingUri: string }>
  | Readonly<{ kind: "RenameTargetExists"; filename: GistFilename }>
  | Readonly<{ kind: "GitHubApiError"; status: number; message: string }>
  | ValidationError;
