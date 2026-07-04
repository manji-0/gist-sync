import * as vscode from "vscode";
import { err, type Result } from "neverthrow";
import * as v from "valibot";
import { schemaResult } from "../../boundary/schema-result";
import type { FileLink } from "../../domain/file-link";
import { FileLink as FileLinkParser } from "../../domain/file-link";
import { GistFilename } from "../../domain/gist-filename";
import { GistId } from "../../domain/gist-id";

const FILE_LINKS_KEY = "gistSync.fileLinks";
const LEGACY_MAPPINGS_KEY = "gistSync.mappings";

const LegacyMappingSchema = v.object({
  gistId: v.string(),
  gistUrl: v.pipe(v.string(), v.url()),
  filename: v.pipe(v.string(), v.minLength(1)),
  rawUrl: v.optional(v.pipe(v.string(), v.url())),
  replacesFilename: v.optional(v.pipe(v.string(), v.minLength(1))),
  overwrite: v.optional(v.boolean()),
  lastSyncedAt: v.string(),
});

export const migrateLegacyMapping = (raw: unknown): Result<FileLink, void> => {
  const parsed = schemaResult(LegacyMappingSchema)(raw);
  if (parsed.isErr()) {
    return err(undefined);
  }

  const gistId = GistId.parse(parsed.value.gistId);
  if (gistId.isErr()) {
    return err(undefined);
  }

  const filename = GistFilename.parse(parsed.value.filename);
  if (filename.isErr()) {
    return err(undefined);
  }

  let pendingRename: { remove: import("../../domain/gist-filename").GistFilename } | undefined;
  if (parsed.value.replacesFilename) {
    const remove = GistFilename.parse(parsed.value.replacesFilename);
    if (remove.isErr()) {
      return err(undefined);
    }
    pendingRename = { remove: remove.value };
  }

  return FileLinkParser.parse({
    gistId: gistId.value,
    gistUrl: parsed.value.gistUrl,
    filename: filename.value,
    rawUrl: parsed.value.rawUrl,
    pendingRename,
    overwrite: parsed.value.overwrite ?? false,
    lastSyncedAt: parsed.value.lastSyncedAt,
  }).mapErr(() => undefined);
};

export const migrateLegacyFileLinks = async (globalState: vscode.Memento): Promise<number> => {
  const current = globalState.get<Record<string, unknown>>(FILE_LINKS_KEY, {});
  if (Object.keys(current).length > 0) {
    return 0;
  }

  const legacy = globalState.get<Record<string, unknown>>(LEGACY_MAPPINGS_KEY, {});
  const migrated = Object.entries(legacy).flatMap(([uri, value]) => {
    const link = migrateLegacyMapping(value);
    return link.isOk() ? [[uri, link.value] as const] : [];
  });

  if (migrated.length === 0) {
    return 0;
  }

  await globalState.update(FILE_LINKS_KEY, Object.fromEntries(migrated));
  await globalState.update(LEGACY_MAPPINGS_KEY, undefined);

  void vscode.window.showInformationMessage(
    `Gist Sync: migrated ${migrated.length} saved link(s) from a previous version.`,
  );

  return migrated.length;
};
