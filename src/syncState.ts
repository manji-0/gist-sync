import * as vscode from "vscode";
import { GistMapping, GistMappingConflictError } from "./types";

const SYNC_ENABLED_KEY = "gistSync.enabledFiles";
const GIST_MAPPINGS_KEY = "gistSync.mappings";

export class SyncState {
  private enabledFiles: Set<string>;
  private mappings: Map<string, GistMapping>;

  constructor(private readonly globalState: vscode.Memento) {
    this.enabledFiles = new Set(
      globalState.get<string[]>(SYNC_ENABLED_KEY, [])
    );
    const raw = globalState.get<Record<string, GistMapping>>(
      GIST_MAPPINGS_KEY,
      {}
    );
    this.mappings = new Map(Object.entries(raw));
  }

  isSyncEnabled(uri: vscode.Uri): boolean {
    return this.enabledFiles.has(uri.toString());
  }

  async setSyncEnabled(uri: vscode.Uri, enabled: boolean): Promise<void> {
    const key = uri.toString();
    if (enabled) {
      this.enabledFiles.add(key);
    } else {
      this.enabledFiles.delete(key);
    }
    await this.persistEnabled();
  }

  async toggleSync(uri: vscode.Uri): Promise<boolean> {
    const next = !this.isSyncEnabled(uri);
    await this.setSyncEnabled(uri, next);
    return next;
  }

  getMapping(uri: vscode.Uri): GistMapping | undefined {
    return this.mappings.get(uri.toString());
  }

  async setMapping(uri: vscode.Uri, mapping: GistMapping): Promise<void> {
    const key = uri.toString();
    for (const [otherKey, other] of this.mappings) {
      if (
        otherKey !== key &&
        other.gistId === mapping.gistId &&
        other.filename === mapping.filename
      ) {
        throw new GistMappingConflictError(
          mapping.gistId,
          mapping.filename,
          otherKey
        );
      }
    }
    this.mappings.set(key, mapping);
    await this.persistMappings();
  }

  async clearMapping(uri: vscode.Uri): Promise<void> {
    this.mappings.delete(uri.toString());
    await this.persistMappings();
  }

  async migrateFile(
    oldUri: vscode.Uri,
    newUri: vscode.Uri
  ): Promise<void> {
    const oldKey = oldUri.toString();
    const newKey = newUri.toString();

    const mapping = this.mappings.get(oldKey);
    if (mapping) {
      this.mappings.delete(oldKey);
      this.mappings.set(newKey, mapping);
      await this.persistMappings();
    }

    if (this.enabledFiles.has(oldKey)) {
      this.enabledFiles.delete(oldKey);
      this.enabledFiles.add(newKey);
      await this.persistEnabled();
    }
  }

  private async persistEnabled(): Promise<void> {
    await this.globalState.update(
      SYNC_ENABLED_KEY,
      Array.from(this.enabledFiles)
    );
  }

  private async persistMappings(): Promise<void> {
    const obj = Object.fromEntries(this.mappings);
    await this.globalState.update(GIST_MAPPINGS_KEY, obj);
  }
}

export function updateHasGistContext(
  uri: vscode.Uri | undefined,
  syncState: SyncState
): void {
  const hasGist = uri ? Boolean(syncState.getMapping(uri)) : false;
  void vscode.commands.executeCommand(
    "setContext",
    "gistSync.hasGist",
    hasGist
  );
}

export function updateSyncModeContext(
  uri: vscode.Uri | undefined,
  syncState: SyncState
): void {
  const enabled = uri ? syncState.isSyncEnabled(uri) : false;
  void vscode.commands.executeCommand(
    "setContext",
    "gistSync.syncEnabled",
    enabled
  );
}
