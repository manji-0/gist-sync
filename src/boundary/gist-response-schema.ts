import { z } from "zod";
import { schemaResult } from "./schema-result";
import { GistId } from "../domain/gist-id";
import { GistFilename } from "../domain/gist-filename";
import { FileLink } from "../domain/file-link";

const GistFileEntrySchema = z.object({
  filename: z.string().optional(),
  raw_url: z.string().url().optional(),
});

export const GistResponseSchema = z.object({
  id: GistId.schema,
  html_url: z.string().url(),
  files: z.record(z.string(), GistFileEntrySchema),
});

export type GistResponse = z.infer<typeof GistResponseSchema>;

export const GistResponse = {
  schema: GistResponseSchema,
  parse: schemaResult(GistResponseSchema),

  toFileLink: (
    response: GistResponse,
    filename: GistFilename,
    options: { overwrite: boolean }
  ) => {
    const file = response.files[filename];
    return FileLink.create({
      gistId: response.id,
      gistUrl: response.html_url,
      filename,
      rawUrl: file?.raw_url,
      overwrite: options.overwrite,
      lastSyncedAt: new Date().toISOString(),
    });
  },

  filenames: (response: GistResponse): GistFilename[] =>
    Object.keys(response.files).flatMap((name) => {
      const parsed = GistFilename.parse(name);
      return parsed.isOk() ? [parsed.value] : [];
    }),
} as const;
