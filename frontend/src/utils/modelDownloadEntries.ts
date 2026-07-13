import { MODEL_ENTRIES, isSep, type ModelEntry, type ModelPreset } from "./modelCatalogue";
import { isVisionCapableModelName } from "./visionModels";

/** Catalogue rows for the Sort & chat download picker — text models only (no multimodal/vision presets). */
export function buildModelEntriesForSortChat(): ModelEntry[] {
  return filterCatalogByVisionRole(false);
}

/** Catalogue rows for the Vision download picker — multimodal presets only. */
export function buildModelEntriesForVision(): ModelEntry[] {
  return filterCatalogByVisionRole(true);
}

function filterCatalogByVisionRole(visionOnly: boolean): ModelEntry[] {
  const out: ModelEntry[] = [];
  let i = 0;
  while (i < MODEL_ENTRIES.length) {
    const e = MODEL_ENTRIES[i];
    if (!isSep(e)) {
      i++;
      continue;
    }
    const sep = e;
    i++;
    const presets: ModelPreset[] = [];
    while (i < MODEL_ENTRIES.length && !isSep(MODEL_ENTRIES[i])) {
      presets.push(MODEL_ENTRIES[i] as ModelPreset);
      i++;
    }
    const filtered = presets.filter((p) =>
      visionOnly ? isVisionCapableModelName(p.name) : !isVisionCapableModelName(p.name)
    );
    if (filtered.length === 0) continue;
    out.push(sep);
    filtered.forEach((p) => out.push(p));
  }
  return out;
}

export function countPresetRows(entries: ModelEntry[]): number {
  return entries.filter((e) => !isSep(e)).length;
}
