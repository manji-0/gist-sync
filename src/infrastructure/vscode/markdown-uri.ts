import * as vscode from "vscode";
import { isMarkdownFilePath } from "../../domain/markdown-path";

export const isMarkdownUri = (uri: vscode.Uri): boolean =>
  uri.scheme === "file" && isMarkdownFilePath(uri.fsPath);
