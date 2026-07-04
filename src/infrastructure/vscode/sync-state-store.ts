import * as vscode from "vscode";
import { err, ok, type Result } from "neverthrow";
import type { FileLink } from "../../domain/file-link";
import { FileLink as FileLinkParser } from "../../domain/file-link";
import type { SyncError } from "../../domain/sync-errors";

const SYNC_ENABLED_KEY = "gistSync.enabledFiles";
const FILE_LINKS_KEY = "gistSync.fileLinks";

export type SyncStateStore = Readonly<{
  isSyncEnabled: (uri: string) => boolean;
  setSyncEnabled: (uri: string, enabled: boolean) => Promise<void>;
  toggleSync: (uri: string) => Promise<boolean>;
  getLink: (uri: string) => FileLink | undefined;
  setLink: (uri: string, link: FileLink) => Promise<Result<void, SyncError>>;
  clearLink: (uri: string) => Promise<void>;
  migrateFile: (oldUri: string, newUri: string) => Promise<void>;
}>;

export const createSyncStateStore = (
  globalState: vscode.Memento
): SyncStateStore => {
  const readEnabled = (): Set<string> =>
    new Set(globalState.get<string[]>(SYNC_ENABLED_KEY, []));

  const readLinks = (): Map<string, FileLink> => {
    const raw = globalState.get<Record<string, unknown>>(FILE_LINKS_KEY, {});
    let failures = 0;
    const entries = Object.entries(raw).flatMap(([uri, value]) => {
      const parsed = FileLinkParser.parse(value);
      if (parsed.isOk()) {
        return [[uri, parsed.value] as const];
      }
      failures += 1;
      return [];
    });
    if (failures > 0) {
      void vscode.window.showWarningMessage(
        `Gist Sync: ${failures} saved link(s) could not be loaded.`
      );
    }
    return new Map(entries);
  };

  let enabled = readEnabled();
  let links = readLinks();

  const persistEnabled = async (): Promise<void> => {
    await globalState.update(SYNC_ENABLED_KEY, Array.from(enabled));
  };

  const persistLinks = async (): Promise<void> => {
    await globalState.update(FILE_LINKS_KEY, Object.fromEntries(links));
  };

  return {
    isSyncEnabled: (uri) => enabled.has(uri),

    setSyncEnabled: async (uri, value) => {
      if (value) {
        enabled.add(uri);
      } else {
        enabled.delete(uri);
      }
      await persistEnabled();
    },

    toggleSync: async (uri) => {
      const next = !enabled.has(uri);
      if (next) {
        enabled.add(uri);
      } else {
        enabled.delete(uri);
      }
      await persistEnabled();
      return next;
    },

    getLink: (uri) => links.get(uri),

    setLink: async (uri, link) => {
      for (const [otherUri, other] of links) {
        if (
          otherUri !== uri &&
          other.gistId === link.gistId &&
          other.filename === link.filename
        ) {
          return err({
            kind: "LinkConflict",
            gistId: link.gistId,
            filename: link.filename,
            existingUri: otherUri,
          });
        }
      }
      links.set(uri, link);
      await persistLinks();
      return ok(undefined);
    },

    clearLink: async (uri) => {
      links.delete(uri);
      await persistLinks();
    },

    migrateFile: async (oldUri, newUri) => {
      const link = links.get(oldUri);
      if (link) {
        links.delete(oldUri);
        links.set(newUri, link);
        await persistLinks();
      }

      if (enabled.has(oldUri)) {
        enabled.delete(oldUri);
        enabled.add(newUri);
        await persistEnabled();
      }
    },
  };
};
