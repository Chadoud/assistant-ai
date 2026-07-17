#!/usr/bin/env bash
# Write a short-lived local release gate stamp under .git/ (never commit).
#
# Usage:
#   bash scripts/write-release-gate.sh desktop
#   bash scripts/write-release-gate.sh mobile
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

KIND="${1:-}"
if [[ "$KIND" != "desktop" && "$KIND" != "mobile" ]]; then
  echo "usage: write-release-gate.sh desktop|mobile" >&2
  exit 2
fi

GIT_DIR="$(git rev-parse --git-dir)"
STAMP="${GIT_DIR}/exo-release-gate"
HEAD_SHA="$(git rev-parse HEAD)"
if [[ "$KIND" == "desktop" ]]; then
  VERSION="$(node -p "require('./package.json').version")"
else
  VERSION="$(grep -E '^version:' mobile/pubspec.yaml | head -1 | sed -E 's/^version:[[:space:]]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
  if [[ -z "$VERSION" ]]; then
    echo "ERROR: could not read semver from mobile/pubspec.yaml" >&2
    exit 1
  fi
fi
EXPIRES_AT="$(($(date +%s) + 4 * 3600))"

{
  echo "kind=${KIND}"
  echo "version=${VERSION}"
  echo "head_sha=${HEAD_SHA}"
  echo "expires_at=${EXPIRES_AT}"
  echo "packaging=ok"
} >"$STAMP"

echo "Wrote release gate stamp: ${STAMP}"
echo "  kind=${KIND} version=${VERSION} head_sha=${HEAD_SHA:0:12} expires_in=4h"
