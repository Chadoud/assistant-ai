# ADR-003: Hybrid OCR + vision image extraction

## Status

Accepted (2026-06-30)

## Context

Photo sorts used OCR-first extraction. When Tesseract returned any "actionable" junk text, vision was skipped. Classifiers and briefing ran on garbled OCR, causing Empty/Uncertain outcomes and hallucinated doc types.

## Decision

1. Run OCR and vision in parallel when a vision model is available (`IMAGE_VISION_ALWAYS=1` default).
2. Merge into `[Visual]` + `[OCR]` excerpt; source `image_hybrid`, `image_hybrid`, or `image_low_signal`.
3. Quality scoring and analyze gates treat vision-backed excerpts as stronger signal.
4. Briefing skipped on untrusted OCR-only image extracts; always allowed when `[Visual]` present.

## Consequences

- +1 vision LLM call per image (latency/cost).
- Identical behavior on local analyze and VPS sort-worker via shared `ingestor.extract_content`.
