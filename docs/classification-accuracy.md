# Classification accuracy

This document ties together **metrics**, **backend thresholds**, **user settings**, and **how to regress** when changing prompts or extraction.

**Related playbooks:** [accuracy-eval-playbook.md](accuracy-eval-playbook.md) (baseline template), [accuracy-extraction-audit.md](accuracy-extraction-audit.md) (Phase 1), [accuracy-classifier-checklist.md](accuracy-classifier-checklist.md) (Phase 2), [accuracy-gates-tuning.md](accuracy-gates-tuning.md) (Phase 3 tradeoffs).

## Phase A — Baselines and gold labels (do this first)

1. **Pick targets once:** e.g. “automation ≥ 60% on corpus X” and “safety ≥ 95% on labeled gold rows.”
2. **Export** a sort-plan CSV after a run on a **fixed** input folder and output tree.
3. **Summarize** the export (reason histogram + automation rate):

   ```bash
   cd backend
   python -m classify_eval.summarize_export path/to/sort-plan.csv
   python -m classify_eval.summarize_export path/to/sort-plan.csv --by-extraction
   ```

4. **Optional safety vs gold:** copy [classify_eval/gold_labels.example.json](classify_eval/gold_labels.example.json) to your own file. Each entry has `match` (substring in basename, or glob like `*.pdf`) and `gold_folder`. Then:

   ```bash
   python -m classify_eval.summarize_export plan.csv --gold my_gold.json
   ```

   Safety here means: among rows that match a gold rule and are **not** `Uncertain`, the share where `target_folder` equals `gold_folder`.

5. **Tune order (recommended):** improve **extraction** and **rules/taxonomy** before lowering **`min_confidence`** in Rules — otherwise you trade precision for automation blindly.

6. **Compare two runs:** export CSVs from the app before and after a change (same input set). Run `summarize_export` on each and compare `automation_rate` and the `reason_histogram` keys (especially ambiguous vs low confidence). For safety, use the same `--gold` file on both CSVs and compare the `safety_pairs` line.

## Stronger OCR (Tesseract + scans)

The backend rasterizes PDF pages then runs **Tesseract**. You can control languages in three ways (first match wins for the job):

1. **Per job from the desktop app:** Settings → *Sorting & output* → **OCR / Tesseract language** (e.g. `fra+eng`), or leave empty to derive from the **Generated Folders Name Language** list when you start a sort. The client sends `tesseract_lang` on `/analyze`.
2. **Process default:** `TESSERACT_LANG` in the backend environment (e.g. Electron **backend env overrides**, or system env before launch).
3. If an explicit bundle fails, Tesseract falls back to its default language.

### `traineddata` files (install alongside your tessdata)

Bundle codes (joined with `+`, e.g. `deu+eng`) need a matching file per code, usually named `<code>.traineddata` from [tessdata](https://github.com/tesseract-ocr/tessdata) or `tessdata_fast`.

| UI / derived language | Typical Tesseract codes | Notes |
|----------------------|------------------------|--------|
| English | `eng` | Often enough alone for English-only scans. |
| French | `fra` (+ `eng` → `fra+eng`) | Mixed FR/EN documents benefit from `+eng`. |
| Spanish | `spa+eng` | |
| German | `deu+eng` | |
| Italian | `ita+eng` | |
| Portuguese | `por+eng` | |
| Dutch | `nld+eng` | |
| Arabic | `ara+eng` | |
| Chinese | `chi_sim+eng` | Simplified Chinese; use `chi_tra` for Traditional if needed. |
| Japanese | `jpn+eng` | |

Optional tuning (same env as backend):

| Variable | Effect |
|----------|--------|
| `TESSERACT_LANG` | Default when the job does not override (e.g. `fra+eng`). |
| `OCR_RENDER_ZOOM` | PDF/image raster scale for OCR (default `2.0`, try `2.5`–`3.0` for small or blurry text; max 4.0). |

**Vision models** (Ollama, Settings) still describe pages when Tesseract returns little text — use a capable **llava** / vision model for card-style PDFs. **Sort/chat** models are text-only classifiers; **vision** is a separate multimodal role — midsize, well-rated models are often a better tradeoff than the largest weights on modest RAM.

- **[Ollama model library](https://ollama.com/library)** — RAM and disk scale with parameter count; prefer reliability and latency you can sustain over the biggest checkpoint unless you have measured gains.

## Extraction quality score

`ingestor._estimate_quality` combines a **length factor** and a **unique-token factor** (alpha tokens). Highly repetitive text can still score below `EXTRACTION_UNCERTAIN_QUALITY`; prefer measuring on real samples before changing that constant.

**Vision fallback (PDF):** when Tesseract yields nothing and a vision model describes the first page, `quality_score` is `min(0.75, _estimate_quality(description))` so short or vague blurbs can still route to *Low extraction quality* instead of trusting a sort.

## Pipeline (order matters)

1. **Extract** text (and optional vision/OCR) → `quality_score`, `extraction_source` (`ingestor.extract_content`).
2. **Classify** → `classify_candidates` (LLM + deterministic rerank; long input uses **head + tail** excerpt in the prompt with a short omission marker). Returns `folder_name`, gate `confidence`, `candidate_scores`, `decision_reason`, plus diagnostics: `llm_confidence`, `rerank_top_score`, `classification_disagree`.
3. **Policy gates** in `JobService.analyze_files` (see `backend/job_service.py`):
   - Optional: if `CONFIDENCE_GATE_MIN_WHEN_DISAGREE` is `true`, **`confidence` is replaced with `min(llm_confidence, rerank_top_score)`** before the gates below (stricter when the rerank winner disagreed with the LLM JSON pick).
   - Low OCR signal (`LOW_SIGNAL_FALLBACK` or very low `quality_score`) caps confidence and sets a review reason.
   - **`quality_score` &lt; `EXTRACTION_UNCERTAIN_QUALITY`** → force `Uncertain`, reason *Low extraction quality; manual review required*.
   - **Top-two margin** &lt; `CANDIDATE_MARGIN_THRESHOLD` → *Ambiguous folder match…*
   - **New folder** when extraction quality &lt; `NEW_FOLDER_MIN_QUALITY` → *New folder blocked…*
   - **`confidence` &lt; per-job `min_confidence`** (or server default `CONFIDENCE_THRESHOLD` when unset) → *Low confidence…*
4. **User sorting rules** (filename glob, priority): **after** all gates, `first_matching_rule` may **override** `suggested_folder` / `final_folder` (**Move to folder**) or force **Uncertain** (**Skip (review)**). `rule_applied_id` is stored on the job file for UI and CSV export. Rule target folders get `confidence = max(previous, min_confidence, 0.95)` so they are not immediately undone by the confidence gate (already passed).

## Metrics (define “good”)

| Metric | Definition |
|--------|------------|
| **Automation rate** | Share of files **not** ending in `Uncertain` (or your chosen review bucket). |
| **Safety rate** | On a **labeled** eval set, share of non-Uncertain predictions matching a gold folder. |
| **Reason breakdown** | Counts per `reason` string (ambiguous / low extraction / low confidence, etc.). |
| **Latency** | Optional: p50/p95 of the classify path. |

Target example: raise automation **without** dropping safety below X% on a fixed eval set.

## Constants (`backend/constants.py`)

These defaults can be **overridden by environment variables** of the same name (read at process start). The desktop app can persist overrides under **Settings → Sorting & output → Advanced classification** (writes `backend-env-overrides.json` in user data and restarts the backend).

| Constant | Env override | Role |
|----------|----------------|------|
| `CONFIDENCE_THRESHOLD` | — | Default floor when job has no `min_confidence`. |
| `EXTRACTION_UNCERTAIN_QUALITY` | `EXTRACTION_UNCERTAIN_QUALITY` | Below this → always `Uncertain` (no new noisy folders from bad OCR). |
| `EXTRACTION_LOW_QUALITY_FLOOR` | `EXTRACTION_LOW_QUALITY_FLOOR` | Caps model confidence when signal is very weak. |
| `NEW_FOLDER_MIN_QUALITY` | `NEW_FOLDER_MIN_QUALITY` | Block **new** folder names when evidence is thin. |
| `CANDIDATE_MARGIN_THRESHOLD` | `CANDIDATE_MARGIN_THRESHOLD` | If top two reranked scores are closer than this → `Uncertain` (default **0.08**; was 0.12 — overlap scores often cluster). |
| `LLM_CANDIDATE_AGREEMENT_BOOST` | `LLM_CANDIDATE_AGREEMENT_BOOST` | Added to the **LLM’s** chosen folder’s rerank score before margin (default **0.12**) so the model’s pick is not lost to near-tied token overlap. |
| `MAX_CANDIDATES` | `MAX_CANDIDATES` | Max folders scored per file (default **8**). Higher improves recall when you have many folders; increases work per file. The LLM pick and **Uncertain** stay in the shortlist when truncating. |
| `CONFIDENCE_GATE_MIN_WHEN_DISAGREE` | `CONFIDENCE_GATE_MIN_WHEN_DISAGREE` | If `1` / `true` / `yes`, the confidence gate uses **`min(llm_confidence, rerank_top_score)`** when the final folder disagreed with the LLM JSON pick (default **off**). |
| `OCR_PAGE_LIMIT`, `MAX_CHARS`, `EXTRACTION_EXCERPT_MAX_CHARS` | (not wired to env by default) | Extraction bounds; tune using eval + reason histograms, not guesswork. |

**Narrow tie-break** (see below): `OLLAMA_NARROW_TIE_BREAK`, `OLLAMA_NARROW_MARGIN` — also set via advanced settings or the shell environment before starting the backend.

## User settings (UI)

- **`min_confidence`** (Rules / job config): per-job floor for “accept” vs `Uncertain`. When set, it replaces the default `CONFIDENCE_THRESHOLD` for the confidence gate.
- **Sorting rules** (Settings → Output & rules): evaluated **after** classify + gates. **Move to folder** overrides the AI result; **Skip (review)** forces `Uncertain`. Prefer precise basename patterns (e.g. `payslip_*`, `tax_2024_*`).

## Confidence shown vs gate

- The **gate** uses a single `confidence`: the LLM’s JSON `confidence` when the **chosen** folder matches the LLM’s parsed `folder_name`; otherwise the **top rerank overlap score** (different scale). Job rows also store **`llm_confidence`** and **`rerank_top_score`** for tooltips and CSV export (`sort-plan-*.csv` includes both columns).

## Context index (`backend/context_index.py`)

Successful sorts can feed **keywords** and **sample snippets** per folder. That data is passed as `folder_contexts` into the classifier prompt, improving reuse of existing folders. Approving good moves reinforces this over time.

## Optional: narrow tie-break (second LLM pass)

When two folders remain very close after reranking, a **narrow** prompt can ask the model to pick **only between the top two**:

| Variable | Meaning |
|----------|---------|
| `OLLAMA_NARROW_TIE_BREAK` | `1` / `true` / `yes` to enable. |
| `OLLAMA_NARROW_MARGIN` | Margin below which the narrow pass runs (default `0.12` if unset — see `classifier.py`). |

Uses the same `OLLAMA_CHAT_OPTIONS` as other calls (e.g. low temperature). **Desktop:** enable under Advanced classification, or set env vars before launch (Electron merges `process.env` into the backend child).

## Automated evaluation

- **Text fixtures (needs Ollama):** from `backend/`, run `python -m classify_eval.run_eval` (see `classify_eval/run_eval.py`). Set `OLLAMA_EVAL=0` to skip live calls (CI-friendly no-op).
- **Real files (extract → classify → gates):** `python -m classify_eval.run_file_eval --paths file1.pdf --existing-folders "HR,Finance"` — logs `quality_score`, raw model output, and outcome after the same gates as `JobService`. Use `OLLAMA_EVAL=0` to print extraction only.
- **pytest:** `test_classifier_ollama_mock.py`, `test_job_service_analyze_gates.py`, `test_ingestor_quality.py`, `test_analyze_apply_flow.py`, `test_summarize_export.py`.

## Manual QA / CSV regression

1. Run a job on a **fixed folder** of representative files (mix of PDFs, scans, short text).
2. Export or inspect the **reason** field per file.
3. Compare **reason histogram** and **automation rate** to a saved **baseline** after changes (prompts, thresholds, extraction).
4. Spot-check **safety**: files that should never land outside a small set of folders (e.g. finance vs HR) still go to `Uncertain` when unsure.

Optional: keep a small spreadsheet of `path → gold_folder` and diff predicted folders vs gold for non-Uncertain rows.
