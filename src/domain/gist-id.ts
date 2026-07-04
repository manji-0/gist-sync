import { z } from "zod";
import { schemaResult } from "../boundary/schema-result";

export const GistIdBrand = Symbol();
const gistIdPattern = /^[a-f0-9]{20,}$/i;

const GistIdSchema = z
  .string()
  .regex(gistIdPattern, "Invalid gist id")
  .brand<typeof GistIdBrand>();

export type GistId = z.infer<typeof GistIdSchema>;

const parseId = schemaResult(GistIdSchema);

const parseFromUrl = (raw: string): ReturnType<typeof parseId> => {
  const trimmed = raw.trim();
  const direct = parseId(trimmed);
  if (direct.isOk()) {
    return direct;
  }

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.hostname === "gist.github.com" && parts.length > 0) {
      return parseId(parts[parts.length - 1]);
    }

    if (url.hostname === "gist.githubusercontent.com" && parts.length >= 2) {
      return parseId(parts[1]);
    }
  } catch {
    return direct;
  }

  return direct;
};

export const GistId = {
  schema: GistIdSchema,
  parse: parseId,
  parseFromUrl,
} as const;
