#!/usr/bin/env bash
# EXO — macOS Development Launcher
# Run from the project root: bash start-dev.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "EXO - Dev Mode (macOS)"
echo "========================================"

# ── 1. Local Ollama (skipped — cloud LLM only; see docs/CLOUD_LLM_ONLY.md) ───
LOCAL_OLLAMA=0
if [ -f "$ROOT/backend/.env" ]; then
  if grep -qE '^[[:space:]]*OLLAMA_MODE=local' "$ROOT/backend/.env"; then
    LOCAL_OLLAMA=1
  fi
fi

if [ "$LOCAL_OLLAMA" = "1" ]; then
  echo "WARNING: OLLAMA_MODE=local — test-only; production uses Exo VPS (docs/CLOUD_LLM_ONLY.md)."
  if ! command -v ollama &>/dev/null; then
    echo ""
    echo "Ollama not found. Installing via curl..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo "Ollama installed."
  fi

  if ! curl -s --max-time 2 "http://localhost:11434/api/tags" &>/dev/null; then
    echo "Starting Ollama service..."
    ollama serve &>/tmp/ollama-serve.log &
    sleep 2
  fi
  echo "Ollama ready (local test mode)."
else
  echo "Cloud LLM mode — skipping local Ollama install/serve."
fi

# ── 1b. Check/install OCR (Tesseract) — always local ─────────────────────────
if ! command -v tesseract &>/dev/null; then
  echo "Tesseract OCR not found."
  if [[ "$(uname)" == "Darwin" ]] && command -v brew &>/dev/null; then
    echo "Installing tesseract via Homebrew..."
    brew install tesseract || true
  fi
fi
if command -v tesseract &>/dev/null; then
  echo "OCR ready: $(tesseract --version | head -n 1)"
else
  echo "OCR still missing; scanned files will use low-signal fallback."
fi

# ── 2. Start Python backend (if needed) ───────────────────────────────────
echo ""
if curl -s --max-time 1 "http://127.0.0.1:7799/health" 2>/dev/null | grep -qE '"status"\s*:\s*"ok"'; then
  echo "Backend already running on port 7799."
  BACKEND_PID=""
else
  # ── 2a. Install / sync Python dependencies first ────────────────────────
  if [ -f "$ROOT/backend/requirements.txt" ]; then
    echo "Installing/syncing Python dependencies..."
    PYTHON_CMD=$(command -v python3 || command -v python)
    "$PYTHON_CMD" -m pip install -r "$ROOT/backend/requirements.txt" --quiet --disable-pip-version-check || \
      echo "pip install had warnings (non-fatal) — check manually if the backend fails to start."
    echo "Python dependencies OK."
  fi

  echo "Starting Python backend on port 7799..."
  cd "$ROOT/backend"
  python3 -m uvicorn main:app --host 127.0.0.1 --port 7799 --reload &>/tmp/ai-sorter-backend.log &
  BACKEND_PID=$!
  cd "$ROOT"
fi

# Wait for backend to be ready
echo "Waiting for backend..."
BACKEND_READY=false
for i in $(seq 1 120); do
  sleep 0.5
  if curl -s --max-time 1 "http://127.0.0.1:7799/health" 2>/dev/null | grep -qE '"status"\s*:\s*"ok"'; then
    BACKEND_READY=true
    break
  fi
done

if $BACKEND_READY; then
  echo "Backend is ready!"
else
  echo "Backend not responding yet — proceeding anyway."
fi

# ── 3. Start Vite frontend ────────────────────────────────────────────────
echo ""
if curl -s --max-time 1 "http://localhost:5173" &>/dev/null; then
  echo "Vite already running on port 5173."
  VITE_PID=""
else
  echo "Starting Vite frontend on port 5173..."
  cd "$ROOT/frontend"
  npm run dev &>/tmp/ai-sorter-vite.log &
  VITE_PID=$!
  cd "$ROOT"
fi

# Wait for Vite to be ready
echo "Waiting for Vite..."
VITE_READY=false
for i in $(seq 1 30); do
  sleep 0.5
  if curl -s --max-time 1 "http://localhost:5173" &>/dev/null; then
    VITE_READY=true
    break
  fi
done

if $VITE_READY; then
  echo "Vite is ready!"
else
  echo "Vite not responding yet — proceeding anyway."
fi

# ── 4. Launch Electron ────────────────────────────────────────────────────
echo ""
echo "Launching Electron window..."
export NODE_ENV=development
export SKIP_BACKEND=1
if [[ "$(uname)" == "Darwin" ]]; then
  node "$ROOT/scripts/prepare-mac-dev-app.cjs" || true
fi
node "$ROOT/scripts/run-electron-dev.js"

# ── Cleanup on exit ───────────────────────────────────────────────────────
echo "Shutting down background processes..."
if [[ -n "$BACKEND_PID" ]]; then
  kill $BACKEND_PID 2>/dev/null || true
fi
if [[ -n "$VITE_PID" ]]; then
  kill $VITE_PID 2>/dev/null || true
fi
