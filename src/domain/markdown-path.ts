import * as path from "path";

export const isMarkdownFilePath = (fsPath: string): boolean =>
  path.extname(fsPath).toLowerCase() === ".md";
