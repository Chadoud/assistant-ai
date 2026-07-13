# Accuracy evaluation playbook

Use this with [classification-accuracy.md](classification-accuracy.md). Goal: **correct folder** with **minimal wrong auto-moves**—measure before changing extraction, classifier, or gates. Phase 1 extraction drill-down: [accuracy-extraction-audit.md](accuracy-extraction-audit.md).

## Phase 0 — Freeze a baseline

1. **Build a small eval set** (10–50 files): mix native PDFs, scanned PDFs, images, short text. Do not commit documents with personal data; keep the folder path in your own notes or `backend/classify_eval/eval_corpus/` (see [eval_corpus README](../backend/classify_eval/eval_corpus/README.md)).

2. **Optional gold labels** — JSON array as in [gold_labels.example.json](../backend/classify_eval/gold_labels.example.json): `{ "match": "glob or substring", "gold_folder": "Expected" }`.

3. **Run one job** in the app on that folder (same model, OCR, and rules you want to compare).

4. **Export** sort-plan CSV (Workspace / queue UI → export plan when available).

5. **Summarize** from repo `backend/`:

   ```bash
   python -m classify_eval.summarize_export path/to/sort-plan.csv
   python -m classify_eval.summarize_export path/to/sort-plan.csv --gold path/to/gold.json
   python -m classify_eval.summarize_export path/to/sort-plan.csv --by-extraction
   ```

6. **Record baseline** — copy the printed lines into the template below (or attach CSV to a ticket).

### Baseline record (template)

| Field | Value |
|--------|--------|
| Date | |
| Corpus path (local only) | |
| Job model / vision / OCR | |
| `automation_rate` | |
| `safety_rate_labeled_auto` (if gold) | |
| Top 5 `reason_histogram` keys | |
| Notes | |

## Phase 1+ — After a change

Re-run the same job on the **same** corpus, export CSV, run `summarize_export` again. Compare:

- `automation_rate` (higher is not always better if safety drops).
- Reason histogram (especially low extraction, ambiguous, low confidence).
- With `--by-extraction`: whether failures cluster on `pdf_ocr`, `image_vision`, etc.

## Fixture sanity check (CI)

The repo includes a **synthetic** CSV under `backend/classify_eval/fixtures/baseline_sort_plan.csv` used by tests only; it is not a real accuracy baseline for your machine.

**Structure-sort fixes:** Any change to geo/property/subject assist or batch clustering must add or update a fixture in `backend/tests/fixtures/structure_corpus/` or `backend/classify_eval/fixtures/`, and pass `tests/test_sort_signals.py` + `tests/test_hilal_batch_regression.py`. See [SORT_INTELLIGENCE_ROADMAP.md](SORT_INTELLIGENCE_ROADMAP.md) Phase 0.
