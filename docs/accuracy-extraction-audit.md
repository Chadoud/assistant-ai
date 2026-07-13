# Extraction audit (Phase 1)

After you have a [baseline](accuracy-eval-playbook.md), separate **reading failures** from **wrong-folder** guesses using sort-plan CSV columns `extraction_source`, `extraction_quality`, and `reason`.

## Quick commands

From `backend/`:

```bash
python -m classify_eval.summarize_export path/to/sort-plan.csv --by-extraction
```

Interpretation:

- Many rows under **`pdf_ocr`** / **`image_ocr`** with **`quality_low_*`** → prioritize Tesseract language packs (Settings → OCR / job language), scan resolution, then **`OCR_RENDER_ZOOM`** (see [classification-accuracy.md](classification-accuracy.md)).
- **`LOW_SIGNAL`** or empty extraction with vision columns used → confirm a **vision** model is installed and selected for scans ([backend/ingestor.py](../backend/ingestor.py): PDF vision supplement band, image vision fallback).
- **`pdf_text`** / high quality but wrong folder → shift focus to **classification** (Phase 2), not OCR zoom.

## Environment knobs (backend)

| Variable | Purpose |
|----------|---------|
| `TESSERACT_LANG` | Default OCR language when the job does not override. |
| `OCR_RENDER_ZOOM` | Raster scale for PDF/image OCR (try 2.5–3.0 on small or blurry text; max 4.0). |

## Code references

- Extraction entry: `extract_content` in [backend/ingestor.py](../backend/ingestor.py)
- Quality estimate: `_estimate_quality` in the same module
- Gates using quality: [backend/analyze_policy.py](../backend/analyze_policy.py)
