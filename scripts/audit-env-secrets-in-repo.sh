#!/usr/bin/env bash
# Fail when tracked files look like real env secrets (not *.example).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "FAIL: $*"
  exit 1
}

# 1) Tracked env backups / non-example env files must never be committed.
tracked_env="$(git ls-files | rg -i '(^|/)\.env(\.|$)' || true)"
if [[ -n "$tracked_env" ]]; then
  bad=""
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    case "$file" in
      *.example|*.example.*|*.verify.example|*.deploy.example|*.db.example|*.release.example) continue ;;
      *) bad+="${file}"$'\n' ;;
    esac
  done <<< "$tracked_env"
  if [[ -n "$bad" ]]; then
    echo "FAIL: tracked env files that are not examples:"
    printf '%s' "$bad"
    echo "Remove them from git; keep only *.example templates."
    exit 1
  fi
fi

# 2) Private key material in tracked sources (except explicit examples/docs handled below).
pem_hits="$(git grep -n 'BEGIN PRIVATE KEY' -- ':!*.md' ':!docs/' ':!scripts/audit-env-secrets-in-repo.sh' 2>/dev/null || true)"
if [[ -n "$pem_hits" ]]; then
  pem_bad=""
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    file="${line%%:*}"
    case "$file" in
      *.example|*.example.*) continue ;;
      *) pem_bad+="${line}"$'\n' ;;
    esac
  done <<< "$pem_hits"
  if [[ -n "$pem_bad" ]]; then
    echo "FAIL: tracked private key material:"
    printf '%s' "$pem_bad"
    exit 1
  fi
fi

# 3) Literal desktop OLLAMA_API_KEY=sk- (cloud virtual keys only on desktop).
PATTERN='OLLAMA_API_KEY=sk-'
ALLOWLIST=(
  "backend/.env.example"
  "cloud-node/.env.example"
  "cloud-node/.env.verify.example"
  "infra/llm/.env.example"
  "docs/"
)

matches="$(git grep -n "$PATTERN" -- ':!*.md' ':!docs/' ':!scripts/audit-env-secrets-in-repo.sh' 2>/dev/null || true)"
if [[ -z "$matches" ]]; then
  echo "OK: no tracked secret env files, private keys, or OLLAMA_API_KEY=sk- literals"
  exit 0
fi

filtered=""
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  file="${line%%:*}"
  skip=0
  for allowed in "${ALLOWLIST[@]}"; do
    if [[ "$file" == "$allowed"* ]]; then
      skip=1
      break
    fi
  done
  if [[ "$skip" == "0" ]] && [[ "$line" != *"#"* ]]; then
    filtered+="${line}"$'\n'
  fi
done <<< "$matches"

if [[ -z "$filtered" ]]; then
  echo "OK: only commented or example OLLAMA_API_KEY references"
  exit 0
fi

echo "FAIL: tracked files contain literal OLLAMA_API_KEY secrets:"
printf '%s' "$filtered"
echo "Remove keys from repo; use cloud sign-in virtual keys on desktop."
exit 1
