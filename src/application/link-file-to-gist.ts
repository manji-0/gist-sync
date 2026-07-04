import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { GistId } from "../domain/gist-id";
import {
  GistResponse,
  type GistResponse as GistResponseType,
} from "../boundary/gist-response-schema";
import type { FileLink } from "../domain/file-link";
import { GistFilename, type LinkFilenameMode } from "../domain/gist-filename";
import type { SyncError } from "../domain/sync-errors";
import type { GistClient } from "../infrastructure/github/gist-client";

export type LinkMode = LinkFilenameMode;

export type LinkFileResult = Readonly<{
  link: FileLink;
  gist: GistResponseType;
}>;

export const createLinkFileToGist = (client: GistClient) => ({
  execute: (input: {
    gistIdRaw: string;
    localFilename: GistFilename;
    mode: LinkMode;
    selectedFilename?: GistFilename;
    gistResponse?: GistResponseType;
  }): ResultAsync<LinkFileResult, SyncError> => {
    const gistIdResult = GistId.parseFromUrl(input.gistIdRaw);
    if (gistIdResult.isErr()) {
      return errAsync<LinkFileResult, SyncError>({
        kind: "InvalidGistInput",
      });
    }

    const gistSource = input.gistResponse
      ? okAsync(input.gistResponse)
      : client.getGist(gistIdResult.value);

    return gistSource.andThen((response) => {
      const filenames = GistResponse.filenames(response);
      if (input.mode === "select" && filenames.length === 0) {
        return errAsync<LinkFileResult, SyncError>({ kind: "GistHasNoFiles" });
      }

      const filenameResult = GistFilename.resolveForLink(
        input.localFilename,
        filenames,
        input.mode,
        input.selectedFilename,
      );

      if (filenameResult.isErr()) {
        return errAsync<LinkFileResult, SyncError>(filenameResult.error);
      }

      const linkResult = GistResponse.toFileLink(response, filenameResult.value, {
        overwrite: input.mode === "overwrite",
      });

      if (linkResult.isErr()) {
        return errAsync<LinkFileResult, SyncError>(linkResult.error);
      }

      return okAsync({ link: linkResult.value, gist: response });
    });
  },
});

export type LinkFileToGist = ReturnType<typeof createLinkFileToGist>;
