import type { FileEntry } from "../../api";

interface SortFileDebugDetailsProps {
  file: FileEntry;
}

function line(label: string, value: string | number | boolean | null | undefined): string | null {
  if (value == null || value === "") return null;
  return `${label}: ${value}`;
}

/**
 * Extra classifier / pipeline fields for product admins (mirrors dev CSV columns in the UI).
 */
export function SortFileDebugDetails({ file }: SortFileDebugDetailsProps) {
  const candidates =
    file.candidate_scores?.length &&
    file.candidate_scores
      .slice(0, 5)
      .map((c: { folder_name: string; score: number }) => `${c.folder_name} (${c.score.toFixed(3)})`)
      .join(" · ");

  const trace = file.decision_trace;
  const traceTail =
    trace && typeof trace === "object" && trace !== null && "structure_auto_tail" in trace
      ? String((trace as { structure_auto_tail?: unknown }).structure_auto_tail ?? "").trim()
      : "";
  const structureSubject = traceTail;

  const rows = [
    line("decision_reason", file.decision_reason ?? undefined),
    line("llm_reason", file.llm_reason ?? undefined),
    line("detected_language", file.detected_language ?? undefined),
    line("doc_kind", file.doc_kind ?? undefined),
    file.document_briefing?.trim()
      ? `briefing: ${file.document_briefing.trim().slice(0, 200)}`
      : null,
    line("llm_confidence", file.llm_confidence != null ? file.llm_confidence.toFixed(3) : undefined),
    line("llm_folder", file.llm_folder_name ?? undefined),
    line("disagree", file.classification_disagree != null ? String(file.classification_disagree) : undefined),
    line("rerank_top", file.rerank_top_score != null ? file.rerank_top_score.toFixed(3) : undefined),
    line("structure_path", file.structure_path_provisional ?? undefined),
    structureSubject ? `structure_subject: ${structureSubject}` : null,
    file.structure_values && Object.keys(file.structure_values).length > 0
      ? `structure_values: ${JSON.stringify(file.structure_values)}`
      : null,
    file.decision_trace &&
    typeof file.decision_trace === "object" &&
    file.decision_trace !== null &&
    "structure_assist" in file.decision_trace &&
    file.decision_trace.structure_assist
      ? `structure_assist: ${JSON.stringify(file.decision_trace.structure_assist)}`
      : null,
    file.decision_trace &&
    typeof file.decision_trace === "object" &&
    file.decision_trace !== null &&
    "structure_cluster_id" in file.decision_trace &&
    file.decision_trace.structure_cluster_id
      ? `structure_cluster_id: ${String(file.decision_trace.structure_cluster_id)}`
      : null,
    line("extraction", file.extraction_source ?? undefined),
    line("quality", file.extraction_quality != null ? file.extraction_quality.toFixed(2) : undefined),
    line("timing_ms", file.analyze_duration_ms != null ? String(file.analyze_duration_ms) : undefined),
    candidates ? `candidates: ${candidates}` : null,
    file.analysis_excerpt?.trim() ? `excerpt: ${file.analysis_excerpt.trim().slice(0, 280)}` : null,
    file.decision_trace ? `trace: ${JSON.stringify(file.decision_trace).slice(0, 400)}` : null,
  ].filter(Boolean) as string[];

  if (rows.length === 0) return null;

  return (
    <details className="rounded-md border border-border/70 bg-bg-secondary/50 px-2 py-1 text-2xs text-text-secondary">
      <summary className="cursor-pointer select-none text-muted">AI sort debug</summary>
      <ul className="mt-1 space-y-0.5 break-words font-mono text-3xs leading-snug">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </details>
  );
}
