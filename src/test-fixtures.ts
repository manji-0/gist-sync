import * as v from "valibot";
import { GistResponse, GistResponseSchema } from "./boundary/gist-response-schema";
import { FileLink } from "./domain/file-link";
import { GistFilename } from "./domain/gist-filename";
import { GistId } from "./domain/gist-id";

export const FIXTURE_GIST_ID = "a1b2c3d4e5f6789012345678abcdef01" as const;

export const fixtureFileLinkInput = {
  gistId: FIXTURE_GIST_ID,
  gistUrl: "https://gist.github.com/user/abc",
  filename: "foo.md",
  overwrite: false,
  lastSyncedAt: "2024-01-01T00:00:00.000Z",
} as const satisfies v.InferInput<typeof FileLink.schema>;

export const fixtureGistResponseInput = {
  id: FIXTURE_GIST_ID,
  html_url: "https://gist.github.com/user/abc",
  files: {
    "foo.md": {
      raw_url: "https://gist.githubusercontent.com/user/abc/raw/foo.md",
    },
    "README.md": {},
  },
} as const satisfies v.InferInput<typeof GistResponseSchema>;

export const fixtureGistId = () => GistId.parse(FIXTURE_GIST_ID)._unsafeUnwrap();

export const fixtureGistFilename = (name: string) => GistFilename.parse(name)._unsafeUnwrap();

export const fixtureFileLink = () => FileLink.create(fixtureFileLinkInput)._unsafeUnwrap();

export const fixtureGistResponse = () =>
  GistResponse.parse(fixtureGistResponseInput)._unsafeUnwrap();
