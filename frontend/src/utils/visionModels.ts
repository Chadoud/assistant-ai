import { normalizeModel } from "./modelCatalogue";

/** Keep in sync with VISION_KEYWORDS in backend/vision.py */
const VISION_MODEL_KEYWORDS = [
  "llava",
  "moondream",
  "bakllava",
  "minicpm-v",
  "llava-llama3",
  "llava-phi3",
] as const;

export function isVisionCapableModelName(name: string): boolean {
  const lower = name.toLowerCase();
  return VISION_MODEL_KEYWORDS.some((k) => lower.includes(k));
}

/** First vision-capable install — mirrors backend find_vision_model order for the same list. */
export function firstInstalledVisionModel(models: string[]): string | null {
  for (const m of models) {
    if (isVisionCapableModelName(m)) return m;
  }
  return null;
}

/**
 * Mirrors backend resolve_vision_model when GET /vision/status is unavailable
 * (e.g. older packaged backend.exe).
 */
export function resolveVisionModelClient(
  models: string[],
  preferred: string | null | undefined
): string | null {
  const auto = firstInstalledVisionModel(models);
  const p = preferred?.trim();
  if (!p || p.toLowerCase() === "auto") return auto;
  const pBase = normalizeModel(p);
  for (const m of models) {
    const mBase = normalizeModel(m);
    if (m === p || mBase === pBase) {
      if (isVisionCapableModelName(m)) return m;
      return auto;
    }
  }
  return auto;
}
