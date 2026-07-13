import { normalizeModel } from "./modelCatalogue";
import { isVisionCapableModelName } from "./visionModels";

/** A Gemini cloud model slug — never a local Ollama model. */
function isGeminiModelName(name: string): boolean {
  return name.startsWith("gemini-") || name.startsWith("models/gemini");
}

/**
 * Rows for Settings → Installed → Sort & chat: Ollama's text models plus the app's chosen
 * sort model when it's missing from the API list (stale list, tag mismatch, or settings-only).
 *
 * Gemini model slugs are excluded — they are cloud chat models, not Ollama sort models,
 * and should never appear in the local sort-model table.
 */
export function sortChatInstalledDisplayModels(ollamaModels: string[], settingsSortModel: string): string[] {
  const base = ollamaModels.filter((m) => !isVisionCapableModelName(m));
  const sortPick = settingsSortModel.trim();
  if (!sortPick || isVisionCapableModelName(sortPick) || isGeminiModelName(sortPick)) return base;
  const present = base.some((m) => normalizeModel(m) === normalizeModel(sortPick));
  if (present) return base;
  return [...base, sortPick];
}

export function isModelReportedByOllama(ollamaModels: string[], name: string): boolean {
  return ollamaModels.some((m) => m === name || normalizeModel(m) === normalizeModel(name));
}

/** Embedding models from the cloud gateway — not shown as the sort LLM. */
export function isEmbeddingModelName(name: string): boolean {
  return name.toLowerCase().includes("embed");
}

/**
 * Full model id for Settings (e.g. ``mistral:latest`` from the gateway list).
 * Falls back to the saved settings name when the API list is stale.
 */
export function resolveSortModelDisplayName(ollamaModels: string[], settingsSortModel: string): string {
  const pick = settingsSortModel.trim();
  const textModels = ollamaModels.filter(
    (m) => !isVisionCapableModelName(m) && !isEmbeddingModelName(m),
  );
  if (pick) {
    const matched = textModels.find((m) => m === pick || normalizeModel(m) === normalizeModel(pick));
    if (matched) return matched;
    if (!isVisionCapableModelName(pick) && !isEmbeddingModelName(pick)) return pick;
  }
  return textModels[0] ?? (pick || "mistral");
}

/** Model id sent to POST /analyze — never empty when cloud or local lists allow a default. */
export function resolveSortModelForJob(ollamaModels: string[], settingsSortModel: string): string {
  return resolveSortModelDisplayName(ollamaModels, settingsSortModel);
}

/**
 * Ollama API list plus saved sort/vision picks — used for download dropdown "On disk" when the
 * API list is empty, stale, or still loading.
 */
export function effectiveModelsForDownloadUi(
  ollamaModels: string[],
  sortModel: string,
  visionModel: string | undefined
): string[] {
  const base = [...ollamaModels];
  const add = (raw: string | undefined) => {
    const s = (raw ?? "").trim();
    if (!s || isGeminiModelName(s)) return;
    if (!base.some((m) => normalizeModel(m) === normalizeModel(s))) base.push(s);
  };
  add(sortModel);
  add(visionModel);
  return base;
}
