import { describe, expect, it } from "vitest";
import { GistId } from "./gist-id";

describe("GistId", () => {
  const gistId = "a1b2c3d4e5f6789012345678abcdef01";

  it("accepts a bare gist id", () => {
    expect(GistId.parse(gistId).isOk()).toBe(true);
  });

  it("parses gist.github.com URLs", () => {
    expect(GistId.parseFromUrl(`https://gist.github.com/user/${gistId}`).isOk()).toBe(
      true
    );
  });

  it("rejects invalid input", () => {
    expect(GistId.parseFromUrl("not-a-gist").isErr()).toBe(true);
  });
});
