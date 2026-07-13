import type { AppSettings } from "../types/settings";
import { effectiveMinConfidenceForJob } from "./automationPreset";
import { documentBriefingRequestField } from "./sortSystemPromptPayload";
import { sortClassifyPayloadForJob } from "./sortClassifyPayload";
import { buildAnalyzeOcrPayload } from "./tesseractLang";

/** Body for POST /sort/desktop-defaults — mirrors Sort-tab job options (no paths/model). */
export function buildSortDesktopDefaultsPayload(
  settings: AppSettings,
  installedTesseractLangs: string[] | undefined
): Record<string, unknown> {
  const enabledRules = settings.rules.filter((r) => r.enabled && r.pattern.trim());
  const ocrPayload = buildAnalyzeOcrPayload(settings, installedTesseractLangs);
  return {
    output_dir: settings.outputDir.trim(),
    mode: settings.mode,
    language: settings.language,
    vision_model: settings.visionModel.trim() || undefined,
    rules: enabledRules,
    on_collision: settings.onCollision,
    min_confidence: effectiveMinConfidenceForJob(settings),
    tesseract_auto: ocrPayload.tesseract_auto ?? true,
    ...(ocrPayload.tesseract_langs?.length ? { tesseract_langs: ocrPayload.tesseract_langs } : {}),
    ...sortClassifyPayloadForJob(settings),
    ...documentBriefingRequestField(settings),
  };
}
