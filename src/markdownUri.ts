import * as path from "path";
import * as vscode from "vscode";

export function isMarkdownFilePath(fsPath: string): boolean {
  return path.extname(fsPath).toLowerCase() === ".md";
}

export function isMarkdownUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && isMarkdownFilePath(uri.fsPath);
}
