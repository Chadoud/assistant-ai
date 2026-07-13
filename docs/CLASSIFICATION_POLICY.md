# Classification Policy Map

**Maintenance:** If you change `analyze_policy`, classifier gates, or extraction-time hints in code, update this map in the same PR (or a follow-up with a ticket link) so the doc matches behavior.

This file documents how one file moves from extracted signal to final folder.

## Signal sources

- Extraction pipeline: `backend/ingestor.py`
  - `pdf_text`, `pdf_ocr`, `pdf_vision`, `image_ocr`, `image_vision`, `image_hybrid`, `spreadsheet_preview`, `cam_point_set_text`, etc.
  - Hybrid images merge `[Visual]` (vision describe) + `[OCR]` (Tesseract) when `IMAGE_VISION_ALWAYS=1` (default).
- Filename tokens and optional hints:
  - `signals.filename_tokens`
  - `signals.document_hint`
- Classifier prompts:
  - `backend/classifier_prompts.py`

## Folder decision flow

1. Extract text + metadata (`extract_content`).
2. Classify + rerank (`classifier.classify_candidates` / `classifier_scoring`).
3. Apply gates (`analyze_policy.apply_analyze_gates`):
   - confidence thresholds
   - weak-signal handling
   - filename escape cues
   - generic media guardrails

## Filename cue policy

`analyze_policy.filename_supports_llm_escape()` contains high-signal filename cues used when text quality is weak.

- Positive examples: banking terms, insurance terms, contract terms, CNC/CAM suffixes (`.nc`, `.pts`, `.cnc`, `.gcode`, `.tap`).
- Guardrail: do not use extension-only shortcuts for generic video buckets.

## Document hint policy

`document_hint` is an extraction-time cue intended to prevent obvious misroutes:

- Swiss AVS context in PDFs.
- CAM/point-set `.pts` disambiguation (not calendar/iCal).

Hints are advisory and do not bypass confidence gates by themselves.

## Prompt-level guardrails

`SYSTEM_PROMPT` enforces:

- topic-based routing for video and image-derived content
- no calendar routing for non-calendar photos
- no `Videos` segment for still-image source filenames
- strict JSON output with `folder_name`, `confidence`, `reason`, `primary_purpose`

When `sort_structure_template` is enabled on a job, classification uses structured `theme_values` JSON and path assembly; caps finalize after analyze. See [SORT_STRUCTURE_TEMPLATES.md](SORT_STRUCTURE_TEMPLATES.md).

## Gate outcomes

`apply_analyze_gates` can:

- keep model pick
- cap confidence
- route to `Uncertain`
- allow trusted existing-folder picks for weak body text under specific conditions

The final decision must be explainable by:

- extraction quality/source
- top-candidate margin
- LLM confidence/disagreement
- gate reason text stored on each row
