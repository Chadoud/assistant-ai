#!/usr/bin/env bash
# Smoke-test sort-worker on staging (or any VPS with Caddy route).
# Usage:
#   export SORT_WORKER_URL=https://llm-staging.exosites.ch/v1/sort/worker
#   export OLLAMA_API_KEY=sk-...
#   bash scripts/smoke-sort-worker-staging.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${SORT_WORKER_URL:-${EXOSITES_CLOUD_SORT_WORKER_URL:-}}"
TOKEN="${OLLAMA_API_KEY:-${SORT_WORKER_API_KEY:-}}"

if [[ -z "$BASE" ]]; then
  echo "Set SORT_WORKER_URL or EXOSITES_CLOUD_SORT_WORKER_URL" >&2
  exit 1
fi
BASE="${BASE%/}"
HEALTH_URL="${BASE}/health"
ANALYZE_URL="${BASE}/analyze-file"

echo "==> GET $HEALTH_URL"
curl -sfS "$HEALTH_URL" | python3 -m json.tool

if [[ -z "$TOKEN" ]]; then
  echo "==> Skipping analyze-file (set OLLAMA_API_KEY or SORT_WORKER_API_KEY)" >&2
  exit 0
fi

TMP="$(mktemp /tmp/exo-sort-smoke-XXXXXX.txt)"
trap 'rm -f "$TMP"' EXIT
echo "Invoice from Acme Corp January 2025" >"$TMP"

PAYLOAD=$(python3 - <<'PY'
import json
print(json.dumps({
    "cfg": {"language": "English", "model": "mistral", "rules": []},
    "existing_folders": ["Invoices", "Uncertain"],
    "folder_contexts": {},
    "threshold": 0.58,
    "uncertain_folder": "Uncertain",
    "ocr_auto": True,
    "source_filename": "smoke-invoice.txt",
}))
PY
)

echo "==> POST $ANALYZE_URL (sample txt)"
HTTP=$(curl -sS -o /tmp/exo-sort-smoke-response.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "payload=${PAYLOAD}" \
  -F "file=@${TMP};filename=smoke-invoice.txt" \
  "$ANALYZE_URL")
echo "HTTP $HTTP"
python3 -m json.tool /tmp/exo-sort-smoke-response.json || cat /tmp/exo-sort-smoke-response.json

if [[ "$HTTP" != "200" ]]; then
  echo "analyze-file failed" >&2
  exit 1
fi

OK=$(python3 -c "import json; print(json.load(open('/tmp/exo-sort-smoke-response.json')).get('ok'))")
if [[ "$OK" != "True" ]]; then
  echo "worker returned ok=false" >&2
  exit 1
fi

if [[ "${SKIP_VISION:-0}" == "1" ]]; then
  echo "==> Sort-worker smoke passed (txt only; SKIP_VISION=1)"
  exit 0
fi

IMG="$(mktemp /tmp/exo-sort-smoke-XXXXXX.jpg)"
trap 'rm -f "$TMP" "$IMG" /tmp/exo-sort-smoke-response.json /tmp/exo-sort-smoke-image-response.json 2>/dev/null || true' EXIT
python3 - "$ROOT/frontend/public/logo.png" "$IMG" <<'PY'
import sys
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
data = src.read_bytes() if src.is_file() else b""
if not data:
    raise SystemExit(f"missing image fixture: {src}")
try:
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.save(dst, format="JPEG", quality=85)
except ImportError:
    dst.write_bytes(data)
PY

IMG_PAYLOAD=$(python3 - <<'PY'
import json
print(json.dumps({
    "cfg": {"language": "English", "model": "mistral", "rules": []},
    "vision_vm": "moondream",
    "existing_folders": ["Invoices", "Uncertain"],
    "folder_contexts": {},
    "threshold": 0.58,
    "uncertain_folder": "Uncertain",
    "ocr_auto": True,
    "source_filename": "smoke-logo.jpg",
}))
PY
)

echo "==> POST $ANALYZE_URL (sample jpg — expect vision/hybrid)"
IMG_HTTP=$(curl -sS -o /tmp/exo-sort-smoke-image-response.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "payload=${IMG_PAYLOAD}" \
  -F "file=@${IMG};filename=smoke-logo.jpg" \
  "$ANALYZE_URL")
echo "HTTP $IMG_HTTP"
python3 -m json.tool /tmp/exo-sort-smoke-image-response.json || cat /tmp/exo-sort-smoke-image-response.json

if [[ "$IMG_HTTP" != "200" ]]; then
  echo "analyze-file image smoke failed" >&2
  exit 1
fi

python3 - <<'PY'
import json
body = json.load(open("/tmp/exo-sort-smoke-image-response.json"))
row = body.get("result") if isinstance(body.get("result"), dict) else body
if body.get("ok") is False or row.get("ok") is False:
    raise SystemExit("worker returned ok=false for image")
src = str(row.get("extraction_source") or "")
if src not in ("image_hybrid", "image_vision"):
    raise SystemExit(f"expected image_hybrid or image_vision, got {src!r}")
print(f"extraction_source={src}")
PY

echo "==> Sort-worker smoke passed"
