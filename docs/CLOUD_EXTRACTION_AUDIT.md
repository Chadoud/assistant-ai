# Cloud extraction audit — OCR, ffmpeg, and the VPS

**Question:** Why do Tesseract and ffmpeg run on the desktop? Should they move to the VPS with cloud LLM sort?

**Short answer:** Today the VPS is an **inference-only** stack (chat, embed, vision). Extraction stays local so **files never leave the device** for sort — only extracted text (≤ ~2k chars) and folder labels go to the VPS. Moving OCR/ffmpeg to the cloud means **uploading file bytes**, which is a different product contract, not a config flip.

Related: [`CLOUD_ARCHITECTURE.md`](CLOUD_ARCHITECTURE.md), [`CLOUD_LLM_ONLY.md`](CLOUD_LLM_ONLY.md), [`SECURITY.md`](../SECURITY.md), [`infra/llm/README.md`](../infra/llm/README.md)

---

## What is on the VPS today (audit)

Staging/production LLM host (`llm-staging.exosites.ch` / `infra/llm/`):

| Service | Role | Has Tesseract? | Has ffmpeg? |
|---------|------|----------------|-------------|
| `ollama-chat` | mistral classify, vision chat | No | No |
| `ollama-embed` | `nomic-embed-text` semantic rerank | No | No |
| `litellm` | OpenAI-compatible gateway | No | No |
| `sort-queue` (optional) | Fair Redis queue → LiteLLM | No | No |
| `sort-credentials-broker` | Mint virtual keys after JWT | No | No |
| `postgres` | LiteLLM keys / usage | No | No |
| `caddy` | TLS | No | No |

**There is no extract/OCR/media service on the VPS.** `pull-models.sh` pulls chat, embed, and vision tags only — not OCR language packs or ffmpeg binaries for user files.

Account API (`api.exosites.ch` / `cloud-node/`) handles auth, entitlements, crash ingest, telemetry — **not** file extraction.

---

## What runs where in the sort pipeline

```
Desktop                          VPS (LiteLLM)
────────                         ─────────────
Read file from disk
  │
  ├─ PDF/DOCX/xlsx parse ──────── (local Python)
  ├─ Tesseract OCR ────────────── (local subprocess)
  ├─ ffmpeg / ffprobe (video) ─── (local subprocess)
  ├─ Optional vision LLM ──────── HTTP → moondream/llava on VPS
  │
  ├─ Document briefing ────────── HTTP → mistral on VPS
  ├─ Classify ─────────────────── HTTP → mistral on VPS
  └─ Semantic rerank embed ────── HTTP → nomic-embed-text on VPS

Move/copy file to output folder (local only)
```

Code entry: `backend/ingestor.extract_content` → called from `JobService` analyze workers (`backend/job_service/_impl.py` via injected callable in `main.py`).

Per-row timings: `analyze_extract_ms` (local) vs `analyze_classify_ms` / `analyze_briefing_ms` (VPS) — see [`SORT_THROUGHPUT.md`](SORT_THROUGHPUT.md).

---

## Why extraction was kept local (design intent)

1. **Privacy / marketing promise** — README and [`SECURITY.md`](../SECURITY.md): sort file **contents** stay on the machine; cloud gets **inference on text**, not a bulk file upload pipeline.
2. **Path-based desktop sort** — Electron passes **local paths** to `127.0.0.1:7799`. Apply phase moves files on disk. VPS has no access to `~/Documents/...`.
3. **Bandwidth** — A 200-file scan batch can be hundreds of MB. Upload-then-OCR is often **slower** than local OCR on a modern laptop, and costs VPS egress/ingress.
4. **VPS capacity** — GA target is **5 concurrent cloud sorters** on one CPU VPS (`CAPACITY_BASELINE.md`). Adding per-file OCR/ffmpeg would compete with LLM slots for CPU/RAM/disk.
5. **No existing upload API for sort** — Browser `POST /analyze-upload` writes to **local** staging (`upload_staging.py` under `~/.ai-file-sorter/browser_uploads/`). Drive/Gmail stream to **local** staging dirs. Nothing sends raw files to `llm-staging`.

---

## Does local OCR/ffmpeg “slow the computer”?

| Phase | Typical CPU load | Blocks cloud LLM? |
|-------|------------------|-------------------|
| Tesseract on a scan | Short burst per page; 1–6 pages cap (`OCR_PAGE_LIMIT`) | No — extract runs **before** classify HTTP call |
| ffmpeg frame grab | Burst per video; capped duration | Same |
| mistral classify on VPS | **Network wait** — desktop CPU mostly idle | This is usually the long pole |
| Concurrent rows (`EXOSITES_SORT_MAX_CONCURRENCY` > 1) | Multiple local extracts can overlap | Can feel “heavy” on low-core machines |

So local extraction **can** spike CPU during large batches, but it is **not** the same bottleneck as VPS LLM latency. Moving OCR to VPS **moves** CPU load; it does not remove work, and adds upload time.

---

## What cloud OCR would require (not built yet)

### Product / legal

- Explicit consent: **files transmitted to Exo VPS** for extraction (even if ephemeral).
- Retention policy: delete bytes after extract (seconds), no training use.
- Max upload size / rate limits per user (already have patterns in `upload_staging.py` for browser caps).

### New VPS service (`sort-extract` — proposed)

- Docker image: `tesseract-ocr` (+ `ara`, `eng`, … packs), `ffmpeg`, Python FastAPI.
- `POST /v1/sort/extract` — multipart file in, JSON `{ text, quality_score, extraction_source, detected_language }` out.
- Auth: same LiteLLM virtual key or broker-scoped token.
- Ephemeral disk: `tmpfs` or delete-on-response; no persistent user storage.
- Compose overlay in `infra/llm/compose/docker-compose.extract-overlay.yml`.

### Desktop / backend changes

- `backend/cloud_extract.py` — HTTP client with timeout and size cap.
- `EXOSITES_CLOUD_EXTRACT=1` feature flag (default **off** until product sign-off).
- Analyze worker: if flag + remote mode, stream file bytes to VPS instead of `extract_content()` locally.
- Vision fallback: still VPS LLM when OCR returns thin text (unchanged).
- Metrics: `analyze_upload_ms`, `analyze_extract_ms` split for ops.

### Ops / capacity

- Size VPS for OCR concurrency separately from LLM (`OLLAMA_NUM_PARALLEL`).
- Load test: upload + OCR + classify end-to-end; expect **worse** p95 on small files vs local OCR.

**Estimate:** multi-sprint (infra + backend + security review + privacy copy + staging gate). Not a single PR.

---

## Recommendation

| Goal | Action |
|------|--------|
| Less desktop CPU **now** | Keep `EXOSITES_SORT_MAX_CONCURRENCY=1`; disable briefing if not needed; fix accuracy gates so rows don’t double LLM calls |
| Match product promise | **Keep OCR local** until privacy copy and upload API are approved |
| Cloud OCR later | Implement `sort-extract` on VPS behind `EXOSITES_CLOUD_EXTRACT=1`; opt-in for power users or thin clients only |
| Never | Assume `ollama pull` or local Tesseract fixes cloud sort — LLM is already on VPS; extract is a separate layer |

---

## Decision log (for PM)

- **2026-06:** Cloud LLM-only policy shipped (`CLOUD_LLM_ONLY.md`). Extraction remains local by design.
- **Open:** Cloud extract service — needs explicit scope approval (file upload to VPS).
