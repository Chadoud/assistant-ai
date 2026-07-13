import type { FileEntry } from "../api";
import { CONFIDENCE_HIGH, CONFIDENCE_LOW } from "../constants";

export type ConfidenceFilter = "all" | "high" | "medium" | "low";
export type ApprovalFilter = "all" | "needsReview" | "approved";

type ReviewTableFilters = {
  confidence: ConfidenceFilter;
  approval: ApprovalFilter;
  searchQuery: string;
};

/** Pure filter for the review queue — confidence band, approval state, filename search. */
export function filterReviewRows(rows: FileEntry[], filters: ReviewTableFilters): FileEntry[] {
  const q = filters.searchQuery.trim().toLowerCase();
  return rows.filter((row) => {
    const confidence = row.confidence ?? 0;
    if (filters.confidence === "high" && confidence < CONFIDENCE_HIGH) return false;
    if (
      filters.confidence === "medium" &&
      (confidence < CONFIDENCE_LOW || confidence >= CONFIDENCE_HIGH)
    ) {
      return false;
    }
    if (filters.confidence === "low" && confidence >= CONFIDENCE_LOW) return false;
    if (filters.approval === "approved" && !row.approved) return false;
    if (filters.approval === "needsReview" && row.approved) return false;
    if (q && !row.name.toLowerCase().includes(q)) return false;
    return true;
  });
}
