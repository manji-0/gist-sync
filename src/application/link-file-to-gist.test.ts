import { describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { createLinkFileToGist } from "./link-file-to-gist";
import { FIXTURE_GIST_ID, fixtureGistFilename, fixtureGistResponse } from "../test-fixtures";

describe("createLinkFileToGist", () => {
  const gist = fixtureGistResponse();
  const local = fixtureGistFilename("note.md");

  it("reuses a preloaded gist response", async () => {
    const getGist = vi.fn();
    const link = createLinkFileToGist({ getGist, createGist: getGist, applyPatch: getGist });

    const result = await link.execute({
      gistIdRaw: FIXTURE_GIST_ID,
      localFilename: local,
      mode: "select",
      selectedFilename: fixtureGistFilename("foo.md"),
      gistResponse: gist,
    });

    expect(getGist).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().link.filename).toBe(fixtureGistFilename("foo.md"));
  });

  it("fetches gist when no preloaded response is provided", async () => {
    const getGist = vi.fn(() => okAsync(gist));
    const link = createLinkFileToGist({ getGist, createGist: getGist, applyPatch: getGist });

    const result = await link.execute({
      gistIdRaw: `https://gist.github.com/user/${FIXTURE_GIST_ID}`,
      localFilename: local,
      mode: "select",
      selectedFilename: fixtureGistFilename("foo.md"),
    });

    expect(getGist).toHaveBeenCalledOnce();
    expect(result.isOk()).toBe(true);
  });

  it("returns GistHasNoFiles in select mode", async () => {
    const emptyGist = { ...gist, files: {} };
    const getGist = vi.fn(() => okAsync(emptyGist));
    const link = createLinkFileToGist({ getGist, createGist: getGist, applyPatch: getGist });

    const result = await link.execute({
      gistIdRaw: FIXTURE_GIST_ID,
      localFilename: local,
      mode: "select",
      gistResponse: emptyGist,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("GistHasNoFiles");
  });
});
