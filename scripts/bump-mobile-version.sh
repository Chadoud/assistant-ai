#!/usr/bin/env bash
# Bump mobile version in pubspec.yaml (semver+build). Does not commit or tag.
#
# Usage:
#   ./scripts/bump-mobile-version.sh 0.2.0 3
#   → version: 0.2.0+3
set -euo pipefail

SEMVER="${1:-}"
BUILD="${2:-}"
if [[ -z "$SEMVER" ]] || ! [[ "$SEMVER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 <semver> [build_number]   e.g. $0 0.2.0 3"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBSPEC="${ROOT}/mobile/pubspec.yaml"

if [[ -z "$BUILD" ]]; then
  BUILD="$(grep '^version:' "$PUBSPEC" | sed -E 's/version: [0-9.]+\\+([0-9]+)/\\1/' || echo 1)"
  BUILD=$((BUILD + 1))
fi

NEW_VERSION="${SEMVER}+${BUILD}"
sed -i.bak -E "s/^version: .+/version: ${NEW_VERSION}/" "$PUBSPEC"
rm -f "${PUBSPEC}.bak"

echo "Bumped mobile/pubspec.yaml → ${NEW_VERSION}"
echo "Next: git tag mobile-v${SEMVER} && git push origin mobile-v${SEMVER}"
