import { err, ok, ResultAsync, errAsync, okAsync, type Result } from "neverthrow";
import type { Sensitive } from "../../boundary/sensitive";
import type { GistResponse } from "../../boundary/gist-response-schema";
import { GistResponse as GistResponseParser } from "../../boundary/gist-response-schema";
import { assertNever } from "../../domain/assert-never";
import type { GistId } from "../../domain/gist-id";
import type { SyncError } from "../../domain/sync-errors";
import type { SyncPatchPlan } from "../../domain/sync-patch";

const GITHUB_API = "https://api.github.com";

export type GistClient = Readonly<{
  getGist: (gistId: GistId) => ResultAsync<GistResponse, SyncError>;
  createGist: (
    plan: Extract<SyncPatchPlan, { kind: "CreateGist" }>
  ) => ResultAsync<GistResponse, SyncError>;
  applyPatch: (
    gistId: GistId,
    files: Record<string, { content: string } | null>
  ) => ResultAsync<GistResponse, SyncError>;
}>;

const request = async (
  token: Sensitive<string>,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<Result<GistResponse, SyncError>> => {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token.unwrap()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "gist-sync-vscode-extension",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    return err({
      kind: "GitHubApiError",
      status: response.status,
      message: `GitHub API error: ${response.status} ${response.statusText}`,
    });
  }

  if (!text) {
    return err({
      kind: "GitHubApiError",
      status: 502,
      message: "Empty GitHub API response",
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return err({
      kind: "ValidationError",
      issues: [{ message: "Invalid JSON in GitHub API response" }],
    });
  }

  return GistResponseParser.parse(body);
};

const withToken = <T>(
  getToken: (interactive: boolean) => Promise<Sensitive<string> | undefined>,
  run: (token: Sensitive<string>) => Promise<Result<T, SyncError>>
): ResultAsync<T, SyncError> =>
  ResultAsync.fromPromise(getToken(true), (): SyncError => ({
    kind: "GitHubApiError",
    status: 0,
    message: "Failed to read auth token",
  })).andThen((token) => {
    if (!token) {
      return errAsync<T, SyncError>({ kind: "NotAuthenticated" });
    }
    return ResultAsync.fromPromise(run(token), (): SyncError => ({
      kind: "GitHubApiError",
      status: 0,
      message: "Unexpected GitHub API failure",
    })).andThen((result) =>
      result.isErr() ? errAsync(result.error) : okAsync(result.value)
    );
  });

export const createGistClient = (
  getToken: (interactive: boolean) => Promise<Sensitive<string> | undefined>
): GistClient => ({
  getGist: (gistId) =>
    withToken(getToken, (token) => request(token, `/gists/${gistId}`)),

  createGist: (plan) =>
    withToken(getToken, (token) =>
      request(token, "/gists", {
        method: "POST",
        body: {
          description: plan.description,
          public: plan.isPublic,
          files: {
            [plan.filename]: { content: plan.content },
          },
        },
      })
    ),

  applyPatch: (gistId, files) =>
    withToken(getToken, (token) =>
      request(token, `/gists/${gistId}`, {
        method: "PATCH",
        body: { files },
      })
    ),
});

export const patchFromPlan = (
  plan: SyncPatchPlan
): Record<string, { content: string } | null> => {
  switch (plan.kind) {
    case "CreateGist":
      return { [plan.filename]: { content: plan.content } };
    case "UpdateFile":
      return { [plan.filename]: { content: plan.content } };
    case "RenameFile": {
      const files: Record<string, { content: string } | null> = {
        [plan.toFilename]: { content: plan.content },
      };
      if (plan.fromFilename !== plan.toFilename) {
        files[plan.fromFilename] = null;
      }
      return files;
    }
    default:
      return assertNever(plan);
  }
};
