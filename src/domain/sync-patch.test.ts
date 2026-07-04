import { describe, expect, it } from "vitest";
import {
  FIXTURE_GIST_ID,
  fixtureFileLink,
  fixtureGistFilename,
  fixtureGistId,
} from "../test-fixtures";
import { SyncPatch } from "./sync-patch";

describe("SyncPatch", () => {
  const gistId = fixtureGistId();
  const foo = fixtureGistFilename("foo.md");
  const bar = fixtureGistFilename("bar.md");

  it("plans create when no link exists", () => {
    expect(
      SyncPatch.plan({
        localFilename: foo,
        content: "hello",
        description: "foo.md",
        isPublic: false,
      }).kind
    ).toBe("CreateGist");
  });

  it("plans update when link has no pending rename", () => {
    const link = fixtureFileLink();
    expect(
      SyncPatch.plan({
        link,
        localFilename: foo,
        content: "hello",
        description: "foo.md",
        isPublic: false,
      }).kind
    ).toBe("UpdateFile");
  });

  it("blocks rename when target exists and overwrite is false", () => {
    const result = SyncPatch.ensureRenameAllowed([bar], {
      kind: "RenameFile",
      gistId,
      fromFilename: foo,
      toFilename: bar,
      content: "x",
      allowOverwrite: false,
    });
    expect(result.isErr()).toBe(true);
  });
});
