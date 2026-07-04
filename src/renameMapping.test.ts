import { describe, expect, it } from "vitest";
import { mappingAfterLocalRename } from "./renameMapping";
import { GistMapping } from "./types";

describe("mappingAfterLocalRename", () => {
  const base: GistMapping = {
    gistId: "abc",
    gistUrl: "https://gist.github.com/abc",
    filename: "foo.md",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
  };

  it("follows local basename when gist filename matched the old name", () => {
    expect(mappingAfterLocalRename(base, "foo.md", "bar.md")).toEqual({
      ...base,
      filename: "bar.md",
      replacesFilename: "foo.md",
    });
  });

  it("keeps a deliberate cross-name link unchanged", () => {
    const linked = { ...base, filename: "README.md" };
    expect(mappingAfterLocalRename(linked, "notes.md", "bar.md")).toEqual(linked);
  });
});
