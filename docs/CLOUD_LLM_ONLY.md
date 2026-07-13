# Cloud LLM only — no local inference models

**Policy:** Exo does **not** run sort/classify/embed/vision LLM models on the user’s desktop. All inference for file sorting goes through the **Exo VPS** (LiteLLM gateway). The desktop runs **OCR (Tesseract)**, file I/O, and the FastAPI job pipeline locally.

Related: [`CLOUD_ARCHITECTURE.md`](CLOUD_ARCHITECTURE.md), [`SORT_THROUGHPUT.md`](SORT_THROUGHPUT.md), [`TESTING_PHASE_CHECKLIST.md`](TESTING_PHASE_CHECKLIST.md)

---

## What runs where

| Work | Where | Notes |
|------|--------|--------|
| Tesseract OCR | **Desktop today** → **VPS `sort-worker`** (see [`CLOUD_SORT_VPS_PLAN.md`](CLOUD_SORT_VPS_PLAN.md)) | Until Phase 3, local; then ephemeral upload |
| ffmpeg / file parse | **Desktop today** → **VPS `sort-worker`** | Same |
| **Classify** (mistral) | **VPS** | `POST /v1/chat/completions` via LiteLLM |
| **Embeddings** (semantic rerank) | **VPS** | `POST /v1/embeddings` — ops provision `nomic-embed-text` on the stack |
| **Vision** (thin OCR fallback) | **VPS** | Same gateway when OCR quality is low |
| **Document briefing** | **VPS** | Optional second chat call per file |
| Chat / assistant | **User’s provider** | Gemini, OpenAI, etc. — separate from sort LLM |
| Offline Whisper (voice) | **Desktop (optional)** | User opt-in under Settings → Voice; not sort LLM |

---

## Configuration (defaults)

In `backend/.env` (see `backend/.env.example`):

```env
OLLAMA_MODE=remote
EXOSITES_REMOTE_LLM=1
OLLAMA_HOST=https://llm-staging.exosites.ch
```

Packaged builds inject managed credentials via `backend-env-overrides.json` after sign-in (`electron/entitlement/sortCredentials.js`).

**Do not** document or implement:

- `ollama pull …` on the user machine for sort accuracy
- `ollama serve` in dev launchers unless `OLLAMA_MODE=local` is explicitly set for **pytest-only** local shim tests
- Settings UI to switch sort LLM to “this computer”

---

## Code paths

| Module | Behavior |
|--------|----------|
| `backend/llm/ollama_client.py` | `is_remote_mode()` defaults to **remote**; `ollama_host()` falls back to staging gateway, not `127.0.0.1:11434` |
| `backend/classifier.py`, `vision.py`, `semantic_rerank.py` | All call `ollama_client` — remote HTTP in production |
| `electron/ollama.js` | `isRemoteOllamaMode()` defaults true; skips local `ollama serve` |
| `start-dev.sh` / `start-dev.ps1` | Skip Ollama unless `OLLAMA_MODE=local` in `backend/.env` |
| `backend/activity_vision.py` | No local vision fallback — cloud orchestrator or window title only |

Local `ollama` Python package usage remains **only** when tests set `OLLAMA_MODE=local` explicitly (`backend/tests/test_ollama_client.py`).

---

## Ops / staging validation

Before shipping accuracy changes that add LLM calls per file:

1. Confirm embed + chat models on VPS (`infra/llm/`)
2. Run `python3 scripts/ga-sort-concurrency-load-test.py`
3. Run `./scripts/ga-live-sort-smoke.py` against staging
4. Check p95 against [`SORT_THROUGHPUT.md`](SORT_THROUGHPUT.md) and `EXOSITES_LLM_MAX_SLOTS`

**Never** validate sort accuracy only on a developer laptop with local Ollama.

---

## Agent / contributor checklist

When changing sort, classify, briefing, rerank, or vision:

- [ ] Assumed **VPS** latency and slot limits (`EXOSITES_LLM_MAX_SLOTS`)
- [ ] No new per-file LLM calls without throughput note
- [ ] Error copy points to **server / sign-in**, not “install Ollama”
- [ ] Tests mock remote HTTP or set `OLLAMA_MODE=local` only in isolated unit tests
- [ ] Dev docs reference `OLLAMA_HOST`, not `localhost:11434`

Cursor rule: [`.cursor/rules/cloud-llm-only.mdc`](../.cursor/rules/cloud-llm-only.mdc)
