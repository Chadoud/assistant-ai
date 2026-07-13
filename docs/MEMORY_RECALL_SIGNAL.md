# Memory recall signal

**Maintenance:** Update this doc when changing `memory_recall_signal`, recall ranking, or stale cleanup.

## Purpose

Track which auto-extracted memories are actually **recalled** (search, prompt injection) and boost ranking for trusted facts. Evict cold, noisy, unreviewed auto rows before count-only caps bite.

Inspired by Cognee `last_accessed` / feedback influence — implemented on SQLite without graph infrastructure.

## Feature flag

| Env | Default | Effect |
|-----|---------|--------|
| `EXOSITES_MEMORY_RECALL_SIGNAL` | `0` (off) | `1` enables touch, ranking blend, stale cleanup, eviction priority |
| `EXOSITES_MEMORY_STALE_DAYS` | `90` | Age threshold for stale auto-memory candidates |

## Schema (`memory_entries`)

| Column | Type | Default |
|--------|------|---------|
| `last_recalled_at` | TEXT NULL | NULL — never instrumented |
| `recall_weight` | REAL | `1.0` — bumped on user review (+0.25, cap 2.0) |

Manual rows: never stale-evicted; recall_weight may still bump on review.

## Ranking (when flag on)

Let \(L\) = lexical score [0,1], \(R = \min(\text{recall\_weight}, 2) / 2\), \(C\) = recency factor from `last_recalled_at`:

- ≤7 days → 1.0; ≤30 → 0.6; ≤90 → 0.3; else 0.0

\[
S_{\text{lex}} = L \cdot (0.70 + 0.15 \cdot R + 0.15 \cdot C)
\]

Optional embedding blend unchanged: \(0.6 \cdot S_{\text{lex}} + 0.4 \cdot \text{sim}\).

## Recall touch

`touch_memory_recall(ids, source)` updates `last_recalled_at` in batch.

Triggers:

- `search_memories` — returned rows with `score >= 0.12`
- `format_memory_for_prompt` — rows included in prompt block

## Stale cleanup

`cleanup_stale_memories` — auto, unreviewed, not archived:

- `noise_score >= 0.35` **or**
- `last_recalled_at` NULL and `updated_at` older than stale days **or**
- `last_recalled_at` older than stale days

Merged into `POST /memory/cleanup-noise` when `include_stale=true`.

Noise REJECT/QUARANTINE still handled by `cleanup_noise_memories`.

## LLM boundaries (unchanged)

- Sort/classify → VPS (cloud sort credentials)
- Memory distill / chat → `llm.complete` (configured cloud providers)
- Memory semantic rerank → optional embeddings; lexical-only fallback

See also `docs/MEMORY_SIGNAL_QUALITY.md`.
