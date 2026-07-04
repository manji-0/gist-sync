const GIST_ID_PATTERN = /^[a-f0-9]{20,}$/i;

export function parseGistId(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  if (GIST_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.hostname === "gist.github.com" && parts.length > 0) {
      const id = parts[parts.length - 1];
      if (GIST_ID_PATTERN.test(id)) {
        return id;
      }
    }

    if (url.hostname === "gist.githubusercontent.com" && parts.length >= 2) {
      const id = parts[1];
      if (GIST_ID_PATTERN.test(id)) {
        return id;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function rawUrlFromGistFile(rawUrl?: string): string | undefined {
  return rawUrl?.trim() || undefined;
}
