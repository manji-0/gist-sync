import { describe, expect, it } from "vitest";
import { formatSyncError } from "./format-sync-error";
import { fixtureGistFilename, fixtureGistId } from "../test-fixtures";

describe("formatSyncError", () => {
  it("formats auth errors", () => {
    expect(formatSyncError({ kind: "NotAuthenticated" })).toContain("Not signed in");
  });

  it("maps GitHub 401 to auth guidance", () => {
    expect(
      formatSyncError({
        kind: "GitHubApiError",
        status: 401,
        message: "Unauthorized",
      })
    ).toContain("Authentication failed");
  });

  it("joins validation issues", () => {
    expect(
      formatSyncError({
        kind: "ValidationError",
        issues: [{ message: "bad field" }, { message: "missing id" }],
      })
    ).toBe("bad field; missing id");
  });

  it("formats link conflicts with filename", () => {
    expect(
      formatSyncError({
        kind: "LinkConflict",
        gistId: fixtureGistId(),
        filename: fixtureGistFilename("foo.md"),
        existingUri: "file:///other.md",
      })
    ).toContain('foo.md');
  });
});
