import { errAsync, okAsync } from "neverthrow";
import { GistResponse } from "../boundary/gist-response-schema";
import { FileLink as FileLinkDomain } from "../domain/file-link";
import { SyncPatch } from "../domain/sync-patch";
import { assertNever } from "../domain/assert-never";
import {
  createGistClient,
  patchFromPlan,
  type GistClient,
} from "../infrastructure/github/gist-client";

export type SyncFileInput = Readonly<{
  link?: import("../domain/file-link").FileLink;
  localFilename: import("../domain/gist-filename").GistFilename;
  content: string;
  description: string;
  isPublic: boolean;
}>;

const toFileLinkAsync = (
  response: import("../boundary/gist-response-schema").GistResponse,
  filename: import("../domain/gist-filename").GistFilename,
  options: { overwrite: boolean }
) => {
  const linkResult = GistResponse.toFileLink(response, filename, options);
  return linkResult.isErr()
    ? errAsync(linkResult.error)
    : okAsync(linkResult.value);
};

export const createSyncFile = (client: GistClient) => ({
  execute: (input: SyncFileInput) => {
    const plan = SyncPatch.plan(input);

    switch (plan.kind) {
      case "CreateGist":
        return client
          .createGist(plan)
          .andThen((response) =>
            toFileLinkAsync(response, plan.filename, { overwrite: false })
          );

      case "RenameFile":
        return client
          .getGist(plan.gistId)
          .andThen((gist) => {
            const allowed = SyncPatch.ensureRenameAllowed(
              GistResponse.filenames(gist),
              plan
            );
            if (allowed.isErr()) {
              return errAsync(allowed.error);
            }
            return client.applyPatch(plan.gistId, patchFromPlan(plan));
          })
          .andThen((response) =>
            toFileLinkAsync(response, plan.toFilename, {
              overwrite: plan.allowOverwrite,
            }).map(FileLinkDomain.clearPendingRename)
          );

      case "UpdateFile":
        return client
          .applyPatch(plan.gistId, patchFromPlan(plan))
          .andThen((response) =>
            toFileLinkAsync(response, plan.filename, {
              overwrite: input.link?.overwrite ?? false,
            })
          );

      default:
        return assertNever(plan);
    }
  },
});

export type SyncFile = ReturnType<typeof createSyncFile>;

export const createSyncFileUseCase = (
  getToken: (interactive: boolean) => Promise<
    import("../boundary/sensitive").Sensitive<string> | undefined
  >
) => createSyncFile(createGistClient(getToken));
