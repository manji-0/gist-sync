import * as vscode from "vscode";
import type { FileLink } from "../domain/file-link";
import type { SyncStateStore } from "../infrastructure/vscode/sync-state-store";

export class StatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
  }

  showForMarkdown(
    uri: string,
    store: SyncStateStore,
    link?: FileLink
  ): void {
    const enabled = store.isSyncEnabled(uri);
    const mapping = link ?? store.getLink(uri);

    if (!enabled) {
      this.item.command = "gistSync.enableSync";
    } else if (mapping) {
      this.item.command = "gistSync.copyGistUrl";
    } else {
      this.item.command = "gistSync.toggleSyncMode";
    }

    this.item.text = enabled
      ? mapping
        ? "$(cloud-upload) Gist Sync: ON"
        : "$(sync~spin) Gist Sync: ON (pending)"
      : "$(cloud-offline) Gist Sync: OFF";

    this.item.tooltip = enabled
      ? mapping
        ? `Synced to ${mapping.gistUrl}\nClick to copy Gist URL`
        : "Sync mode ON — will sync on save\nClick to toggle sync mode"
      : "Sync mode OFF — click to choose how to enable";

    this.item.backgroundColor = enabled
      ? undefined
      : new vscode.ThemeColor("statusBarItem.warningBackground");

    this.item.show();
  }

  showSyncing(): void {
    this.item.text = "$(sync~spin) Gist Sync: syncing...";
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = "$(error) Gist Sync: error";
    this.item.tooltip = message;
    this.item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
