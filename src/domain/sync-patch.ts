import { err, ok, type Result } from "neverthrow";
import type { FileLink } from "./file-link";
import type { GistFilename } from "./gist-filename";
import type { GistId } from "./gist-id";
import type { SyncError } from "./sync-errors";

export type SyncPatchPlan =
  | Readonly<{
      kind: "CreateGist";
      filename: GistFilename;
      content: string;
      description: string;
      isPublic: boolean;
    }>
  | Readonly<{
      kind: "UpdateFile";
      gistId: GistId;
      filename: GistFilename;
      content: string;
    }>
  | Readonly<{
      kind: "RenameFile";
      gistId: GistId;
      fromFilename: GistFilename;
      toFilename: GistFilename;
      content: string;
      allowOverwrite: boolean;
    }>;

export const SyncPatch = {
  plan: (input: {
    link?: FileLink;
    localFilename: GistFilename;
    content: string;
    description: string;
    isPublic: boolean;
  }): SyncPatchPlan => {
    const { link, localFilename, content, description, isPublic } = input;

    if (!link) {
      return {
        kind: "CreateGist",
        filename: localFilename,
        content,
        description,
        isPublic,
      };
    }

    const pending = link.pendingRename?.remove;
    if (pending && pending !== link.filename) {
      return {
        kind: "RenameFile",
        gistId: link.gistId,
        fromFilename: pending,
        toFilename: link.filename,
        content,
        allowOverwrite: link.overwrite,
      };
    }

    return {
      kind: "UpdateFile",
      gistId: link.gistId,
      filename: link.filename,
      content,
    };
  },

  ensureRenameAllowed: (
    existingFilenames: ReadonlyArray<GistFilename>,
    plan: Extract<SyncPatchPlan, { kind: "RenameFile" }>,
  ): Result<void, SyncError> => {
    if (plan.allowOverwrite) {
      return ok(undefined);
    }

    if (existingFilenames.includes(plan.toFilename)) {
      return err({
        kind: "RenameTargetExists",
        filename: plan.toFilename,
      });
    }

    return ok(undefined);
  },
} as const;
