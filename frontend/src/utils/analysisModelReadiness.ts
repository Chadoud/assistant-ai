import { normalizeModel } from "./modelCatalogue";
import { resolveSortModelForJob } from "./sortChatInstalledModels";
import { resolveVisionModelClient } from "./visionModels";

/** Extra context from the drop zone (folder picker vs drag-drop). */
export type BrowserUploadContext = {
  /** User chose a folder via ``webkitdirectory`` (click). */
  fromFolderPicker?: boolean;
  /** Drag-drop looks like a folder tree (e.g. ``webkitRelativePath`` with slashes). */
  fromFolderTreeDrop?: boolean;
};

/**
 * True when the configured Ollama sort/chat model is present in the installed list (tag-normalized).
 */
function isConfiguredSortModelInstalled(configuredModel: string, installed: string[]): boolean {
  const want = normalizeModel(configuredModel.trim());
  if (!want) return false;
  return installed.some((m) => normalizeModel(m) === want);
}

/** Whether the configured sort model and a usable vision model (explicit or auto) are available locally. */
export type AnalysisModelGap = {
  missingSortModel: boolean;
  missingVisionModel: boolean;
};

export type AnalysisModelGapOptions = {
  /**
   * Sort/classify runs on the cloud LiteLLM gateway — local ``ollama list`` tags are not required.
   * Tesseract OCR still runs on this device; vision models remain an optional local fallback.
   */
  remoteSortLlm?: boolean;
};

/**
 * Compares Settings to installed Ollama tags. Vision uses the same resolution as the analyzer
 * (explicit vision model, or first vision-capable install when empty / auto).
 */
export function getAnalysisModelGap(
  settings: { model: string; visionModel: string },
  installed: string[],
  options?: AnalysisModelGapOptions
): AnalysisModelGap {
  if (options?.remoteSortLlm) {
    const effective = resolveSortModelForJob(installed, settings.model);
    return {
      missingSortModel: !effective.trim(),
      missingVisionModel: false,
    };
  }
  const missingSortModel = !isConfiguredSortModelInstalled(settings.model, installed);
  const missingVisionModel = resolveVisionModelClient(installed, settings.visionModel) === null;
  return { missingSortModel, missingVisionModel };
}
