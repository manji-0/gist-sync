#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pnpm run compile

EDITOR="${GIST_SYNC_EDITOR:-cursor}"
if ! command -v "$EDITOR" >/dev/null 2>&1; then
  if command -v code >/dev/null 2>&1; then
    EDITOR=code
  else
    echo "error: neither GIST_SYNC_EDITOR, cursor, nor code found in PATH" >&2
    exit 1
  fi
fi

WORKSPACE="${1:-$ROOT}"
exec "$EDITOR" --extensionDevelopmentPath="$ROOT" "$WORKSPACE"
