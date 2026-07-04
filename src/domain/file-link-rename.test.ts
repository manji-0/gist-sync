import { describe, expect, it } from "vitest";
import { fixtureFileLink, fixtureGistFilename } from "../test-fixtures";
import { applyLocalRename } from "./file-link-rename";

describe("applyLocalRename", () => {
  const foo = fixtureGistFilename("foo.md");
  const bar = fixtureGistFilename("bar.md");
  const readme = fixtureGistFilename("README.md");
  const base = fixtureFileLink();

  it("follows local basename when gist filename matched the old name", () => {
    expect(applyLocalRename(base, foo, bar)).toEqual({
      ...base,
      filename: bar,
      pendingRename: { remove: foo },
    });
  });

  it("keeps a deliberate cross-name link unchanged", () => {
    const linked = { ...base, filename: readme };
    expect(applyLocalRename(linked, foo, bar)).toEqual(linked);
  });
});
