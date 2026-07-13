# Sort throughput (measurement and knobs)

This note supports repeatable **baseline** numbers before tuning sort speed. It does not replace profiling Ollama itself.

## What to measure

| Metric | How |
|--------|-----|
| Per-row wall time | `analyze_duration_ms` on each job file row (total extract + briefing + classify). |
| Phase breakdown | `analyze_extract_ms`, `analyze_briefing_ms`, `analyze_classify_ms` on each row. |
| Backend logs | Set `EXOSITES_ANALYZE_PHASE_TIMING_DEBUG_LOG=1` for DEBUG lines every file; or rely on `EXOSITES_ANALYZE_PHASE_SLOW_LOG_MS` (default 30s) for INFO lines only on slow rows — shows extract vs briefing vs classify split. |
| User-perceived progress | Wall time until **N** rows reach `review_ready` (e.g. N=10) on a fixed folder. |
| Steady throughput | Files reaching `review_ready` per wall-clock hour on a large batch. |

## Baseline workflow

1. Pick a **fixed** local folder (mixed PDFs + plain `.txt` is a good default). Note machine, Ollama model, and whether the GPU path is active.
2. Run one batch job (same file set, same model) with default server env.
3. Export or inspect job JSON / UI and compute **p50 / p95** of `analyze_duration_ms` for rows in `review_ready`.
4. Repeat after a single change (e.g. `DOCUMENT_BRIEFING_ENABLE=false` or `EXOSITES_SORT_MAX_CONCURRENCY=2`) so comparisons stay apples-to-apples.

## Knobs (short)

| Variable | Effect |
|----------|--------|
| `DOCUMENT_BRIEFING_ENABLE` | Second LLM round per file when `true`. Largest easy win when off. |
| `document_briefing_enable` (per job / Settings) | Overrides the server default for that job only. |
| `DOCUMENT_BRIEFING_SKIP_SMALL_TEXT_ENABLE` | Skips briefing for high-quality plaintext within caps (`BRIEFING_SKIP_MAX_TEXT_CHARS`; Gmail message bodies use `BRIEFING_SKIP_GMAIL_MESSAGE_MAX_TEXT_CHARS`). |
| `OLLAMA_NARROW_MARGIN` | Default **0.06**: extra narrow LLM only when rerank top-1 vs top-2 gap is very small (was effectively **0.12** before, which triggered many second-round calls). |
| `EXOSITES_SORT_MAX_CONCURRENCY` | Parallel analyze tasks for **batch** `analyze_files` **and** Gmail/Drive **streaming** import (default 1; clamped 1–8). Overlaps local read + classify across rows; raises GPU/RAM and Ollama queue depth when >1. |
| `EXOSITES_LLM_MAX_SLOTS` | **Remote LLM only:** caps concurrent LiteLLM calls and **also** caps effective sort concurrency (`min` with `EXOSITES_SORT_MAX_CONCURRENCY`). Match this to VPS `OLLAMA_NUM_PARALLEL` (staging: 2). |
| Model choice | Sort latency is dominated by the **configured Ollama model**. Smaller/faster instruct models trade quality for latency; change the model in app Settings (no server env required). |
| GPU vs CPU for Ollama | Usually the dominant real-world factor when the stack is CPU-bound. Verify the GPU path before tuning concurrency. |

## GPU / Ollama sanity checks (especially Windows)

Throughput tuning is pointless if Ollama is not using the GPU you expect.

1. **Task Manager** (Windows): while sorting, check GPU utilization and whether `ollama` appears under GPU engines.
2. **NVIDIA**: open a terminal and run `nvidia-smi` — confirm a process uses GPU memory during an active sort.
3. **Ollama docs**: see [https://github.com/ollama/ollama/blob/main/docs/gpu.md](https://github.com/ollama/ollama/blob/main/docs/gpu.md) for OS-specific requirements (drivers, WSL vs native, etc.).

If the GPU is idle during long classifies, fix hardware/driver/runtime **before** raising `EXOSITES_SORT_MAX_CONCURRENCY`.

## Fast vs thorough (defaults)

- **`DOCUMENT_BRIEFING_ENABLE=0`** (or disable document briefing in Settings): skips the extra filing briefing LLM pass when speed matters more than that layer of context.
- **Concurrency**: raise **`EXOSITES_SORT_MAX_CONCURRENCY`** slowly (e.g. 2 → 3) only after GPU headroom is confirmed; each increment increases concurrent Ollama work.

## Gmail / Drive streaming

Streaming jobs overlap **network/export** with **local analyze**. Use Gmail export counters on the job for fetch/staging health; use per-row `analyze_*_ms` for extract/briefing/classify breakdown. With `EXOSITES_SORT_MAX_CONCURRENCY` > 1, multiple rows may finish classify **out of order**; row indices and the files list order stay stable.

## Multi-user VPS load test

After deploy, simulate concurrent cloud sort users against staging:

```bash
# Requires LITELLM_MASTER_KEY (cloud-node/.env or env)
python3 scripts/ga-sort-concurrency-load-test.py

# Defaults: 5 users, 2 classify+embed rounds each, 2 parallel requests/user
USERS=5 REQUESTS_PER_USER=3 MAX_P95_MS=90000 python3 scripts/ga-sort-concurrency-load-test.py
```

Cloud sign-in now sets `EXOSITES_LLM_MAX_SLOTS`, `EXOSITES_SORT_MAX_CONCURRENCY`, and (when enabled) `EXOSITES_SORT_QUEUE_URL` from `POST /v1/sort/credentials`.

VPS scale-out overlays: `infra/llm/compose/docker-compose.{split-embed,redis,scale,queue}-overlay.yml` — see `infra/llm/runbooks/scale-out.md`. Enable the Redis queue with `SORT_LLM_QUEUE_ENABLED=1` so classify/embed route through `/v1/sort/inference` instead of hammering LiteLLM directly.

## Structured vision + batch reconcile (2026-07)

| Feature | Env flag | Extra LLM cost | When it runs |
|---------|----------|----------------|--------------|
| Structured vision JSON extract | `EXOSITES_STRUCTURED_VISION_ENABLE=1` | +1 vision call per **degraded** image/PDF scan | When `extraction_confidence < EXOSITES_STRUCTURED_VISION_TRIGGER` (default 0.45) |
| Batch structure reconcile | `EXOSITES_STRUCTURE_BATCH_RECONCILE_ENABLE=1` (default **on**) | +1 chat call per **job** | Jobs with ≥3 files and at least one low-confidence or Uncertain row |

Both respect `EXOSITES_LLM_MAX_SLOTS` — structured vision shares the same slot pool as filing vision and classify. Set `EXOSITES_STRUCTURE_BATCH_RECONCILE_ENABLE=0` to disable batch reconcile; structured vision still defaults off.
