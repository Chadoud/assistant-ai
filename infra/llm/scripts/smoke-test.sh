#!/usr/bin/env bash
# Smoke test LiteLLM OpenAI-compatible API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
fi

BASE="${LLM_BASE_URL:-https://${DOMAIN:-llm-staging.exosites.ch}}"
KEY="${EXO_BACKEND_STAGING_KEY:-${LITELLM_MASTER_KEY:-}}"

if [[ -z "$KEY" ]]; then
  echo "Set EXO_BACKEND_STAGING_KEY or LITELLM_MASTER_KEY in .env"
  exit 1
fi

echo "==> Health: $BASE/health/liveliness"
curl -sf "$BASE/health/liveliness" | head -c 200
echo

echo "==> Chat completion (mistral)"
curl -sf "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral",
    "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
    "max_tokens": 16,
    "temperature": 0
  }' | head -c 500
echo

echo "==> Embeddings (nomic-embed-text)"
curl -sf "$BASE/v1/embeddings" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nomic-embed-text",
    "input": "smoke test"
  }' | head -c 300
echo

if [[ "${SKIP_VISION:-0}" == "1" ]]; then
  echo "==> Skipping moondream vision (SKIP_VISION=1)"
  echo "==> Smoke test passed"
  exit 0
fi

echo "==> Vision chat (moondream)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
LOGO_CANDIDATE="${REPO_ROOT}/frontend/public/logo.png"
VISION_B64="$(python3 - "$LOGO_CANDIDATE" <<'PY'
import base64, sys
from pathlib import Path
logo = Path(sys.argv[1])
if logo.is_file():
    print(base64.b64encode(logo.read_bytes()).decode("ascii"))
    raise SystemExit
print(base64.b64encode(bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
    "070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c"
    "1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c18d0d"
    "18321c1c323232323232323232323232323232323232323232323232323232323232"
    "323232323232323232323232323232323232ffc000110800010001030111000211000"
    "31101ffc4d000c030100020003010000000000000000000000010002003ffc4000140"
    "001000000000000000000000000000000008ffc400121001000000000000000000000"
    "0000000000000ffda0008010100003f00d2cf20ffd9"
)).decode("ascii"))
PY
)"

VISION_HTTP="$(curl -sS -o /tmp/exo-litellm-vision.json -w "%{http_code}" \
  "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "$(python3 - <<PY
import json
print(json.dumps({
    "model": "moondream",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image in one short sentence."},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,${VISION_B64}"}},
        ],
    }],
    "max_tokens": 64,
    "temperature": 0,
}))
PY
)")"
echo "HTTP $VISION_HTTP"
head -c 500 /tmp/exo-litellm-vision.json
echo

if [[ "$VISION_HTTP" != "200" ]]; then
  echo "moondream vision failed — rebuild LiteLLM with Pillow and pull moondream on Ollama" >&2
  exit 1
fi

python3 - <<'PY'
import json
body = json.load(open("/tmp/exo-litellm-vision.json"))
choices = body.get("choices") or []
content = ""
if choices:
    content = (choices[0].get("message") or {}).get("content") or ""
if not str(content).strip():
    raise SystemExit("moondream returned empty content")
print("vision content ok:", str(content).strip()[:120])
PY

echo "==> Smoke test passed"
