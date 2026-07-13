import type { ModelStoragePartial } from "../api";
import { isVisionCapableModelName } from "./visionModels";

/**
 * Partial blob groups that belong in the sort/chat download section: unknown layers, or any
 * manifest-linked text model.
 */
export function filterPartialsForSortChat(partials: ModelStoragePartial[]): ModelStoragePartial[] {
  return partials.filter((p) => {
    const r = p.related_models ?? [];
    if (r.length === 0) return true;
    return r.some((m) => !isVisionCapableModelName(m));
  });
}

/**
 * Partial groups for the vision download section: manifest-linked vision models only.
 * Unassigned layers are listed under sort/chat so we do not duplicate rows.
 */
export function filterPartialsForVision(partials: ModelStoragePartial[]): ModelStoragePartial[] {
  return partials.filter((p) => {
    const r = p.related_models ?? [];
    if (r.length === 0) return false;
    return r.some((m) => isVisionCapableModelName(m));
  });
}

export function sumPartialBytes(rows: ModelStoragePartial[]): number {
  return rows.reduce((acc, p) => acc + p.total_bytes, 0);
}
