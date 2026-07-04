import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { schemaResult, type ValidationError } from "../boundary/schema-result";
import type { SyncError } from "./sync-errors";

export const GistFilenameBrand = Symbol();

const GistFilenameSchema = z
  .string()
  .min(1, "Filename is required")
  .brand<typeof GistFilenameBrand>();

export type GistFilename = z.infer<typeof GistFilenameSchema>;

export type LinkFilenameMode = "select" | "overwrite";

export const GistFilename = {
  schema: GistFilenameSchema,
  parse: schemaResult(GistFilenameSchema),
  fromLocalPath: (fsPath: string): Result<GistFilename, ValidationError> => {
    const base = fsPath.split("/").pop() ?? "note.md";
    const normalized = base.toLowerCase().endsWith(".md") ? base : `${base}.md`;
    return GistFilename.parse(normalized);
  },

  resolveForLink: (
    localName: GistFilename,
    gistFilenames: ReadonlyArray<GistFilename>,
    mode: LinkFilenameMode,
    selected?: GistFilename
  ): Result<GistFilename, SyncError> => {
    if (mode === "overwrite") {
      return ok(localName);
    }

    if (gistFilenames.length === 0) {
      return ok(localName);
    }

    if (gistFilenames.length === 1) {
      return ok(gistFilenames[0]);
    }

    if (gistFilenames.includes(localName)) {
      return ok(localName);
    }

    if (selected) {
      return ok(selected);
    }

    return err({ kind: "InvalidGistInput" });
  },
} as const;
