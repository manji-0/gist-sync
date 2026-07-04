import { GistApiError } from "./types";
import type { GistGetResponse } from "./types";

export function assertGistResponse(data: unknown): GistGetResponse {
  if (!data || typeof data !== "object") {
    throw new GistApiError("Invalid GitHub API response", 502);
  }

  const record = data as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.html_url !== "string") {
    throw new GistApiError("Invalid GitHub API response: missing id or html_url", 502);
  }
  if (!record.files || typeof record.files !== "object") {
    throw new GistApiError("Invalid GitHub API response: missing files", 502);
  }

  return data as GistGetResponse;
}
