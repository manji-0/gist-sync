import { z } from "zod";
import { schemaResult } from "../boundary/schema-result";
import { GistId, type GistId as GistIdType } from "./gist-id";
import { GistFilename, type GistFilename as GistFilenameType } from "./gist-filename";

const PendingRenameSchema = z.object({
  remove: GistFilename.schema,
});

const FileLinkSchema = z.object({
  gistId: GistId.schema,
  gistUrl: z.string().url(),
  filename: GistFilename.schema,
  rawUrl: z.string().url().optional(),
  pendingRename: PendingRenameSchema.optional(),
  overwrite: z.boolean(),
  lastSyncedAt: z.string(),
});

export type FileLink = Readonly<z.infer<typeof FileLinkSchema>>;

export type PendingRename = z.infer<typeof PendingRenameSchema>;

export const FileLink = {
  schema: FileLinkSchema,
  parse: schemaResult(FileLinkSchema),

  create: (input: z.input<typeof FileLinkSchema>) =>
    schemaResult(FileLinkSchema)(input),

  clearPendingRename: (link: FileLink): FileLink => ({
    ...link,
    pendingRename: undefined,
  }),

  key: (gistId: GistIdType, filename: GistFilenameType): string =>
    `${gistId}:${filename}`,
} as const;
