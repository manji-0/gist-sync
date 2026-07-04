import { describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { createSyncFile } from "./sync-file";
import {
  fixtureFileLink,
  fixtureGistFilename,
  fixtureGistResponse,
} from "../test-fixtures";

describe("createSyncFile", () => {
  const gist = fixtureGistResponse();
  const foo = fixtureGistFilename("foo.md");

  it("creates a gist when no link exists", async () => {
    const createGist = vi.fn(() => okAsync(gist));
    const sync = createSyncFile({
      getGist: vi.fn(),
      createGist,
      applyPatch: vi.fn(),
    });

    const result = await sync.execute({
      localFilename: foo,
      content: "hello",
      description: "foo.md",
      isPublic: false,
    });

    expect(createGist).toHaveBeenCalledOnce();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().filename).toBe(foo);
  });

  it("updates an existing linked file", async () => {
    const applyPatch = vi.fn(() => okAsync(gist));
    const sync = createSyncFile({
      getGist: vi.fn(),
      createGist: vi.fn(),
      applyPatch,
    });

    const result = await sync.execute({
      link: fixtureFileLink(),
      localFilename: foo,
      content: "updated",
      description: "foo.md",
      isPublic: false,
    });

    expect(applyPatch).toHaveBeenCalledOnce();
    expect(result.isOk()).toBe(true);
  });

  it("blocks rename when target filename already exists", async () => {
    const bar = fixtureGistFilename("bar.md");
    const link = {
      ...fixtureFileLink(),
      filename: bar,
      pendingRename: { remove: foo },
      overwrite: false,
    };

    const gistWithBar = {
      ...gist,
      files: {
        "foo.md": gist.files["foo.md"],
        "bar.md": {},
      },
    };

    const sync = createSyncFile({
      getGist: vi.fn(() => okAsync(gistWithBar)),
      createGist: vi.fn(),
      applyPatch: vi.fn(),
    });

    const result = await sync.execute({
      link,
      localFilename: bar,
      content: "renamed",
      description: "bar.md",
      isPublic: false,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("RenameTargetExists");
  });
});
