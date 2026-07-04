import * as v from "valibot";
import { schemaResult } from "../boundary/schema-result";
import { GistId, type GistId as GistIdType } from "./gist-id";
import { GistFilename, type GistFilename as GistFilenameType } from "./gist-filename";

const PendingRenameSchema = v.object({
  remove: GistFilename.schema,
});

const FileLinkSchema = v.object({
  gistId: GistId.schema,
  gistUrl: v.pipe(v.string(), v.url()),
  filename: GistFilename.schema,
  rawUrl: v.optional(v.pipe(v.string(), v.url())),
  pendingRename: v.optional(PendingRenameSchema),
  overwrite: v.boolean(),
  lastSyncedAt: v.string(),
});

export type FileLink = Readonly<v.InferOutput<typeof FileLinkSchema>>;

export type PendingRename = v.InferOutput<typeof PendingRenameSchema>;

export const FileLink = {
  schema: FileLinkSchema,
  parse: schemaResult(FileLinkSchema),

  create: (input: v.InferInput<typeof FileLinkSchema>) =>
    schemaResult(FileLinkSchema)(input),

  clearPendingRename: (link: FileLink): FileLink => ({
    ...link,
    pendingRename: undefined,
  }),

  key: (gistId: GistIdType, filename: GistFilenameType): string =>
    `${gistId}:${filename}`,
} as const;
