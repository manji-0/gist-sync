import { describe, expect, it } from "vitest";
import { isMarkdownFilePath } from "./markdownUri";

describe("isMarkdownFilePath", () => {
  it("accepts .md regardless of case", () => {
    expect(isMarkdownFilePath("/tmp/note.md")).toBe(true);
    expect(isMarkdownFilePath("/tmp/note.MD")).toBe(true);
  });

  it("rejects non-markdown files", () => {
    expect(isMarkdownFilePath("/tmp/note.txt")).toBe(false);
  });
});
