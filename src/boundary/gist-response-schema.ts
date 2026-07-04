import * as v from "valibot";
import { schemaResult } from "./schema-result";
import { GistId } from "../domain/gist-id";
import { GistFilename } from "../domain/gist-filename";
import { FileLink } from "../domain/file-link";

const GistFileEntrySchema = v.object({
  filename: v.optional(v.string()),
  raw_url: v.optional(v.pipe(v.string(), v.url())),
});

export const GistResponseSchema = v.object({
  id: GistId.schema,
  html_url: v.pipe(v.string(), v.url()),
  files: v.record(v.string(), GistFileEntrySchema),
});

export type GistResponse = v.InferOutput<typeof GistResponseSchema>;

export const GistResponse = {
  schema: GistResponseSchema,
  parse: schemaResult(GistResponseSchema),

  toFileLink: (response: GistResponse, filename: GistFilename, options: { overwrite: boolean }) => {
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
