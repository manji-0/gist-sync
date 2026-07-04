import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: vi.fn(),
  },
}));

import { migrateLegacyFileLinks, migrateLegacyMapping } from "./legacy-mapping-migration";
import { FIXTURE_GIST_ID, fixtureGistFilename } from "../../test-fixtures";

describe("migrateLegacyMapping", () => {
  it("maps legacy replacesFilename to pendingRename", () => {
    const result = migrateLegacyMapping({
      gistId: FIXTURE_GIST_ID,
      gistUrl: "https://gist.github.com/user/abc",
      filename: "bar.md",
      replacesFilename: "foo.md",
      overwrite: true,
      lastSyncedAt: "2024-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const link = result._unsafeUnwrap();
    expect(link.filename).toEqual(fixtureGistFilename("bar.md"));
    expect(link.pendingRename).toEqual({ remove: fixtureGistFilename("foo.md") });
    expect(link.overwrite).toBe(true);
  });

  it("defaults overwrite to false", () => {
    const result = migrateLegacyMapping({
      gistId: FIXTURE_GIST_ID,
      gistUrl: "https://gist.github.com/user/abc",
      filename: "foo.md",
      lastSyncedAt: "2024-01-01T00:00:00.000Z",
    });

    expect(result._unsafeUnwrap().overwrite).toBe(false);
  });

  it("rejects invalid legacy rows", () => {
    expect(migrateLegacyMapping({ gistId: "bad" }).isErr()).toBe(true);
  });
});

describe("migrateLegacyFileLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("migrates legacy mappings when fileLinks is empty", async () => {
    const store = new Map<string, unknown>([
      [
        "gistSync.mappings",
        {
          "file:///a.md": {
            gistId: FIXTURE_GIST_ID,
            gistUrl: "https://gist.github.com/user/abc",
            filename: "foo.md",
            lastSyncedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      ],
    ]);

    const globalState = {
      get: <T>(key: string, fallback: T): T =>
        (store.get(key) as T | undefined) ?? fallback,
      update: async (key: string, value: unknown) => {
        if (value === undefined) {
          store.delete(key);
        } else {
          store.set(key, value);
        }
      },
    };

    const count = await migrateLegacyFileLinks(globalState);

    expect(count).toBe(1);
    expect(store.has("gistSync.fileLinks")).toBe(true);
    expect(store.has("gistSync.mappings")).toBe(false);
  });

  it("skips migration when fileLinks already exist", async () => {
    const store = new Map<string, unknown>([
      [
        "gistSync.fileLinks",
        {
          "file:///a.md": {
            gistId: FIXTURE_GIST_ID,
            gistUrl: "https://gist.github.com/user/abc",
            filename: "foo.md",
            overwrite: false,
            lastSyncedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      ],
      [
        "gistSync.mappings",
        {
          "file:///legacy.md": {
            gistId: FIXTURE_GIST_ID,
            gistUrl: "https://gist.github.com/user/abc",
            filename: "legacy.md",
            lastSyncedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      ],
    ]);

    const globalState = {
      get: <T>(key: string, fallback: T): T =>
        (store.get(key) as T | undefined) ?? fallback,
      update: async (key: string, value: unknown) => {
        store.set(key, value);
      },
    };

    const count = await migrateLegacyFileLinks(globalState);

    expect(count).toBe(0);
    const links = store.get("gistSync.fileLinks") as Record<string, unknown>;
    expect(Object.keys(links)).toEqual(["file:///a.md"]);
  });
});
