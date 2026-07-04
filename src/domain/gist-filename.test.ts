import { describe, expect, it } from "vitest";
import { fixtureGistFilename } from "../test-fixtures";
import { GistFilename } from "./gist-filename";

describe("GistFilename", () => {
  it("fromLocalPath keeps .md basename", () => {
    const result = GistFilename.fromLocalPath("/notes/hello.md");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(fixtureGistFilename("hello.md"));
  });

  it("fromLocalPath appends .md when missing", () => {
    const result = GistFilename.fromLocalPath("/notes/draft");
    expect(result._unsafeUnwrap()).toEqual(fixtureGistFilename("draft.md"));
  });

  describe("resolveForLink", () => {
    const local = fixtureGistFilename("note.md");
    const other = fixtureGistFilename("other.md");

    it("uses local name in overwrite mode", () => {
      expect(
        GistFilename.resolveForLink(local, [other], "overwrite")._unsafeUnwrap()
      ).toBe(local);
    });

    it("picks the only gist file in select mode", () => {
      expect(
        GistFilename.resolveForLink(local, [other], "select")._unsafeUnwrap()
      ).toBe(other);
    });

    it("requires selection when multiple files and no match", () => {
      const readme = fixtureGistFilename("README.md");
      expect(
        GistFilename.resolveForLink(local, [other, readme], "select").isErr()
      ).toBe(true);
    });
  });
});
