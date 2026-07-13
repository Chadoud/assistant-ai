# Classification and context checklist (Phase 2)

Use after [extraction audit](accuracy-extraction-audit.md) when `extraction_quality` is healthy but folders are wrong or `Ambiguous` / `classification_disagree` dominates the reason histogram.

## 1. Excerpt strategy

- Implementation: `_excerpt_for_classification` in [backend/classifier.py](../backend/classifier.py) — long inputs use **head + tail** with a fixed omission marker so the model still sees start and end of the document.
- Regression: [backend/tests/test_classifier_excerpt.py](../backend/tests/test_classifier_excerpt.py).
- When tuning `MAX_TEXT_EXCERPT` in [backend/constants.py](../backend/constants.py): re-run the same CSV baseline; watch for **worse** behavior on long contracts where the decisive clause lived only in the middle (rare — then consider chunking or a second pass, not blind excerpt growth).

## 2. Folder context index

- Module: [backend/context_index.py](../backend/context_index.py) — keywords and short samples per folder from **successful applies** and reassignments.
- Operational lever: **approve correct sorts** and **reassign** mistakes so the index learns; empty index means the model only has folder *names*, not topical hooks.

## 3. Rerank / ambiguity knobs (A/B with CSV exports)

Documented in [classification-accuracy.md](classification-accuracy.md) constants table:

- `CANDIDATE_MARGIN_THRESHOLD` — top-two margin gate.
- `LLM_CANDIDATE_AGREEMENT_BOOST` — keeps the LLM’s folder competitive in rerank.
- Optional `CONFIDENCE_GATE_MIN_WHEN_DISAGREE` and **narrow tie-break** (`OLLAMA_NARROW_TIE_BREAK`, `OLLAMA_NARROW_MARGIN`).

**Process:** export CSV before and after each single-knob change; run `python -m classify_eval.summarize_export` on both; compare reason counts and (if gold exists) safety.

## 4. Narrow tie-break

Enable only when histogram shows many **near-tie** ambiguous cases and gold safety does not regress — see “Optional: narrow tie-break” in [classification-accuracy.md](classification-accuracy.md).
