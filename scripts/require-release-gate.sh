#!/usr/bin/env bash
# Validate .git/exo-release-gate for a tag about to be pushed.
#
# Usage (from pre-push, one tag at a time):
#   bash scripts/require-release-gate.sh refs/tags/v1.2.3
# Mobile tags: use incubating/mobile (see docs/MOBILE.md)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REF="${1:-}"
if [[ -z "$REF" ]]; then
  echo "usage: require-release-gate.sh refs/tags/vX.Y.Z|refs/tags/mobile-vX.Y.Z" >&2
  exit 2
fi

EXPECTED_KIND=""
EXPECTED_VERSION=""
if [[ "$REF" =~ ^refs/tags/v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  EXPECTED_KIND="desktop"
  EXPECTED_VERSION="${BASH_REMATCH[1]}"
elif [[ "$REF" =~ ^refs/tags/mobile-v ]]; then
  echo "ERROR: mobile-v* tags must be pushed from incubating/mobile, not main." >&2
  echo "See docs/MOBILE.md" >&2
  exit 1
else
  # Non-release tags are not gated.
  exit 0
fi

GIT_DIR="$(git rev-parse --git-dir)"
STAMP="${GIT_DIR}/exo-release-gate"

if [[ ! -f "$STAMP" ]]; then
  echo "ERROR: missing release gate stamp (${STAMP})." >&2
  echo "Run: npm run release:desktop" >&2
  echo "Then: git tag v${EXPECTED_VERSION} && git push origin v${EXPECTED_VERSION}" >&2
  exit 1
fi

# shellcheck disable=SC1090
kind=""
version=""
head_sha=""
expires_at=""
packaging=""
while IFS='=' read -r key value; do
  case "$key" in
    kind) kind="$value" ;;
    version) version="$value" ;;
    head_sha) head_sha="$value" ;;
    expires_at) expires_at="$value" ;;
    packaging) packaging="$value" ;;
  esac
done <"$STAMP"

NOW="$(date +%s)"
CURRENT_SHA="$(git rev-parse HEAD)"

fail() {
  echo "ERROR: release gate stamp invalid — $1" >&2
  echo "Stamp: kind=${kind:-?} version=${version:-?} head_sha=${head_sha:-?} packaging=${packaging:-?}" >&2
  echo "Re-run: npm run release:desktop" >&2
  exit 1
}

[[ "$kind" == "$EXPECTED_KIND" ]] || fail "kind=${kind:-empty} (expected ${EXPECTED_KIND})"
[[ "$version" == "$EXPECTED_VERSION" ]] || fail "version=${version:-empty} (expected ${EXPECTED_VERSION} from tag)"
[[ "$head_sha" == "$CURRENT_SHA" ]] || fail "head_sha mismatch (stamp=${head_sha:0:12} tip=${CURRENT_SHA:0:12}; amend/rebase invalidates stamp)"
[[ -n "$expires_at" && "$expires_at" =~ ^[0-9]+$ ]] || fail "missing/invalid expires_at"
(( NOW <= expires_at )) || fail "stamp expired (re-run release gate)"
[[ "$packaging" == "ok" ]] || fail "packaging=${packaging:-empty} (must be ok; RELEASE_SKIP_PACKAGING cannot produce a valid stamp)"

echo "Release gate OK for ${REF} (kind=${kind} version=${version})"
