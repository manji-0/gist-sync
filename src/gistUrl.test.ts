import { describe, expect, it } from "vitest";
import { parseGistId } from "./gistUrl";

describe("parseGistId", () => {
  const gistId = "a1b2c3d4e5f6789012345678abcdef01";

  it("accepts a bare gist id", () => {
    expect(parseGistId(gistId)).toBe(gistId);
  });

  it("parses gist.github.com URLs", () => {
    expect(parseGistId(`https://gist.github.com/user/${gistId}`)).toBe(gistId);
    expect(parseGistId(`https://gist.github.com/${gistId}`)).toBe(gistId);
  });

  it("parses gist.githubusercontent.com URLs", () => {
    expect(
      parseGistId(`https://gist.githubusercontent.com/user/${gistId}/raw/file.md`)
    ).toBe(gistId);
  });

  it("rejects invalid input", () => {
    expect(parseGistId("")).toBeUndefined();
    expect(parseGistId("not-a-gist")).toBeUndefined();
    expect(parseGistId("https://example.com")).toBeUndefined();
  });
});
