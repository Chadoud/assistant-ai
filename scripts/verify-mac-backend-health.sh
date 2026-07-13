#!/usr/bin/env bash
# Smoke-test a native PyInstaller backend: spawn, wait for /health, exit.
set -euo pipefail

BIN="${1:?usage: verify-mac-backend-health.sh /path/to/backend [port]}"
PORT="${2:-}"
TIMEOUT_SEC="${VERIFY_BACKEND_HEALTH_TIMEOUT_SEC:-120}"
TMPDIR="${TMPDIR:-/tmp}"
LOG_OUT="$(mktemp "${TMPDIR}/exo-backend-smoke.out.XXXXXX")"
LOG_ERR="$(mktemp "${TMPDIR}/exo-backend-smoke.err.XXXXXX")"

if [[ -z "$PORT" ]]; then
  PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("", 0))
print(s.getsockname()[1])
s.close()
PY
)"
fi

if [[ ! -f "$BIN" ]]; then
  echo "::error::backend binary not found: $BIN"
  exit 1
fi

BIN="$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")"
"$BIN" --port "$PORT" >"$LOG_OUT" 2>"$LOG_ERR" &
PID=$!

cleanup() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
}
trap cleanup EXIT

deadline=$((SECONDS + TIMEOUT_SEC))
while (( SECONDS < deadline )); do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "::error::backend exited before /health responded (arch mismatch or PyInstaller failure?)"
    echo "--- stderr ---"
    tail -40 "$LOG_ERR" || true
    echo "--- stdout ---"
    tail -20 "$LOG_OUT" || true
    exit 1
  fi
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    echo "[verify-mac-backend-health] OK on port $PORT ($(file "$BIN"))"
    exit 0
  fi
  sleep 2
done

echo "::error::backend /health did not respond within ${TIMEOUT_SEC}s on port $PORT"
echo "--- stderr ---"
tail -40 "$LOG_ERR" || true
echo "--- stdout ---"
tail -20 "$LOG_OUT" || true
exit 1
