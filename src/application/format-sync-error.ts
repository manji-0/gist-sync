import { assertNever } from "../domain/assert-never";
import type { SyncError } from "../domain/sync-errors";
import { formatValidationIssues } from "../boundary/schema-result";

export const formatSyncError = (error: SyncError): string => {
  switch (error.kind) {
    case "NotAuthenticated":
      return "Not signed in to GitHub. Run 'Gist Sync: Sign in to GitHub' or set a token.";
    case "InvalidGistInput":
      return "Invalid Gist URL or ID.";
    case "GistHasNoFiles":
      return "That Gist has no files.";
    case "LinkConflict":
      return `Gist file "${error.filename}" is already linked from another local file.`;
    case "RenameTargetExists":
      return `Gist already contains "${error.filename}". Use "Link to Gist (Overwrite)" or rename the local file.`;
    case "GitHubApiError":
      if (error.status === 401 || error.status === 403) {
        return "Authentication failed. Sign in to GitHub or check your token has gist scope.";
      }
      if (error.status === 404) {
        return "Gist not found. It may have been deleted — sync again to create a new one.";
      }
      return error.message;
    case "ValidationError":
      return formatValidationIssues(error.issues);
    default:
      return assertNever(error);
  }
};
