#!/usr/bin/env bash
# Push ONLY the current cleaned branch tip to a brand-new empty GitHub repo.
# Never pushes backup/* refs, never --mirror / --all / --tags.
#
# Usage:
#   bash scripts/push-new-public-repo.sh git@github.com:YOU/NEW-REPO.git
#   bash scripts/push-new-public-repo.sh https://github.com/YOU/NEW-REPO.git
#
# Optional:
#   PUBLIC_REMOTE_NAME=public   (default)
#   PUBLIC_BRANCH=main          (default remote branch name)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NEW_URL="${1:-}"
REMOTE_NAME="${PUBLIC_REMOTE_NAME:-public}"
DEST_BRANCH="${PUBLIC_BRANCH:-main}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ -z "$NEW_URL" ]]; then
  echo "Usage: bash scripts/push-new-public-repo.sh <new-empty-repo-git-url>"
  exit 2
fi

if [[ "$CURRENT_BRANCH" == backup/* ]] || [[ "$CURRENT_BRANCH" == *secret* ]]; then
  echo "REFUSE: current branch '$CURRENT_BRANCH' must not be pushed publicly."
  exit 1
fi

if [[ "$CURRENT_BRANCH" != "master" && "$CURRENT_BRANCH" != "main" ]]; then
  echo "REFUSE: checkout master/main first (currently on '$CURRENT_BRANCH')."
  exit 1
fi

echo "== preflight: secret audit =="
bash scripts/audit-env-secrets-in-repo.sh
node scripts/audit-secret-logging.cjs

echo "== preflight: no .env.bak in this branch history =="
if [[ -n "$(git rev-list HEAD -- cloud-node/.env.bak)" ]]; then
  echo "REFUSE: cloud-node/.env.bak still reachable from HEAD history."
  exit 1
fi

echo "== preflight: no leaked secret fragments in HEAD tree =="
# Generic high-risk patterns only — do not embed previously leaked values here.
if git grep -qE 'BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY' HEAD -- \
  ':!*.md' ':!docs/' ':!scripts/audit-env-secrets-in-repo.sh' ':!scripts/push-new-public-repo.sh' \
  ':!*.example' ':!*.example.*' 2>/dev/null; then
  echo "REFUSE: private key material in tracked non-example files."
  exit 1
fi
if git grep -qE 'GOCSPX-[a-zA-Z0-9_-]{20,}' HEAD -- ':!*.md' ':!docs/' ':!*test*' ':!*.example' 2>/dev/null; then
  echo "REFUSE: Google OAuth client secret-looking value in non-test tracked files."
  exit 1
fi
if git grep -qE 'sk-exo-[a-f0-9]{20,}' HEAD -- ':!*.md' ':!docs/' ':!*test*' ':!*.example' 2>/dev/null; then
  echo "REFUSE: LiteLLM master-key-looking value in non-test tracked files."
  exit 1
fi

echo "== preflight: refuse tracked non-example env =="
if git ls-files | rg -q '(^|/)\.env\.bak$|(^|/)\.env$'; then
  echo "REFUSE: tracked .env / .env.bak present."
  exit 1
fi

echo "== preflight: dirty tree check (allow listed WIP only with FORCE_DIRTY=1) =="
if [[ -n "$(git status --porcelain)" && "${FORCE_DIRTY:-}" != "1" ]]; then
  echo "Working tree is dirty. Commit/stash first, or set FORCE_DIRTY=1 to push HEAD only."
  git status -sb
  exit 1
fi

echo "== remote =="
if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  existing="$(git remote get-url "$REMOTE_NAME")"
  if [[ "$existing" != "$NEW_URL" ]]; then
    echo "Remote '$REMOTE_NAME' already points at: $existing"
    echo "Refusing to overwrite. Remove it first: git remote remove $REMOTE_NAME"
    exit 1
  fi
else
  git remote add "$REMOTE_NAME" "$NEW_URL"
fi

echo "== push $($CURRENT_BRANCH)@$(git rev-parse --short HEAD) → $REMOTE_NAME:$DEST_BRANCH =="
echo "This pushes a SINGLE ref only (no --all / --mirror / --tags)."
git push -u "$REMOTE_NAME" "HEAD:${DEST_BRANCH}"

echo "OK: pushed clean tip. Do NOT push backup/pre-secret-purge or origin/master to this remote."
echo "Reminder: rotate secrets that were in the old private history before treating them as safe."
