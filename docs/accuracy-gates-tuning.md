# Gates and automation tradeoffs (Phase 3)

Do **not** loosen gates until [extraction](accuracy-extraction-audit.md) and [classifier](accuracy-classifier-checklist.md) work is measured. This doc is for **explicit** product/engineering tradeoffs.

## Per-job `min_confidence` (app Settings → Rules)

| Change | Likely effect | Risk |
|--------|----------------|------|
| Lower floor | Fewer files in **Uncertain**; more auto-sorted | More files in a folder the user would **disagree** with |
| Raise floor | Safer guesses; more review | More manual work |

**User-visible framing** (see product rules): describe outcomes (“about how many more files may file wrong”) not raw scores alone.

## Server constants ([backend/constants.py](../backend/constants.py))

Overridable via env and, in the desktop app, **Advanced classification** (backend env overrides). Examples:

| Constant | Role |
|----------|------|
| `EXTRACTION_UNCERTAIN_QUALITY` | Below → forced **Uncertain** (bad OCR signal). |
| `EXTRACTION_LOW_QUALITY_FLOOR` | Caps confidence when signal very weak. |
| `NEW_FOLDER_MIN_QUALITY` | Blocks **new** folder names when evidence is thin. |
| `CANDIDENCE_THRESHOLD` | Default floor when job sends no `min_confidence`. |

Lowering extraction thresholds without better OCR/vision usually **increases wrong destinations**, not intelligence.

## Tests

When behavior changes, extend [backend/tests/test_job_service_analyze_gates.py](../backend/tests/test_job_service_analyze_gates.py) and [backend/tests/test_analyze_policy.py](../backend/tests/test_analyze_policy.py) so gates stay pinned to intent.
