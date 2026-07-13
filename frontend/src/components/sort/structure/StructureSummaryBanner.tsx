import type { Job } from "../../../api";
import { useI18n } from "../../../i18n/I18nContext";

function rootFolderCounts(job: Job): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of job.files) {
    const folder = (f.final_folder ?? f.suggested_folder ?? "").trim();
    if (!folder || folder === "Uncertain") continue;
    const root = folder.split("/")[0];
    counts[root] = (counts[root] ?? 0) + 1;
  }
  return counts;
}

interface StructureSummaryBannerProps {
  job: Job;
}

/**
 * Honest batch summary when a structure template was used (counts from real job rows).
 */
export default function StructureSummaryBanner({ job }: StructureSummaryBannerProps) {
  const { t } = useI18n();
  const cfg = job.config as { sort_structure_template?: { enabled?: boolean } } | undefined;
  if (!cfg?.sort_structure_template?.enabled) return null;

  const counts = rootFolderCounts(job);
  const roots = Object.keys(counts);
  if (!roots.length) return null;

  const capRewrites = job.files.filter(
    (f: { structure_cap_rewritten?: boolean }) => f.structure_cap_rewritten
  ).length;

  return (
    <p className="text-sm text-text-secondary rounded-lg border border-border bg-bg-secondary/40 px-3 py-2">
      {t("queue.sortStructure.summaryBanner", {
        roots: roots.length,
        capNote: capRewrites > 0 ? t("queue.sortStructure.capNote", { count: capRewrites }) : "",
      })}
    </p>
  );
}
