import type { MemoryCategory, ScopedMemoryEntry } from "../../api/memory";
import SegmentDonut, { type SegmentDonutItem } from "../charts/SegmentDonut";
import InsightCard from "../ui/InsightCard";
import ListSkeleton from "../ui/ListSkeleton";
import { useI18n } from "../../i18n/I18nContext";
import {
  type MemoryCategoryCount,
  type MemoryOverviewStats,
  type MemorySourceCount,
  MEMORY_SOURCE_COLORS,
  memoryCategoryColor,
  type MemorySourceBucket,
} from "../../utils/memoryOverview";
import { systemMemoryLabelKey } from "../../utils/memoryUi";
import { OTHER_REASON_LABEL } from "../../utils/topNWithOther";

interface MemoryOverviewSectionProps {
  stats: MemoryOverviewStats;
  loading: boolean;
  onNeedsReviewClick: () => void;
  onCategorySliceClick: (slice: MemoryCategoryCount) => void;
  onSourceSliceClick: (slice: MemorySourceCount) => void;
  onBrowseAll: () => void;
  recentEntries: ScopedMemoryEntry[];
}

function DonutLegend({
  rows,
  hoverIdx,
  getColor,
  getLabel,
}: {
  rows: SegmentDonutItem[];
  hoverIdx: number | null;
  getColor: (id: string) => string;
  getLabel: (id: string) => string;
}) {
  return (
    <ul className="w-full space-y-1.5 px-0.5">
      {rows.map((row, index) => (
        <li
          key={row.id}
          className={`flex items-center justify-between gap-2 text-2xs ${
            hoverIdx === index ? "text-text-primary" : "text-muted"
          }`}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: getColor(row.id) }}
              aria-hidden
            />
            <span className="truncate">{getLabel(row.id)}</span>
          </span>
          <span className="shrink-0 tabular-nums font-semibold text-text-secondary">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

function MemoryRecencySparkline({
  weeks,
  title,
  subtitle,
}: {
  weeks: MemoryOverviewStats["weeklyActivity"];
  title: string;
  subtitle: string;
}) {
  const max = Math.max(1, ...weeks.map((week) => week.count));

  return (
    <InsightCard
      id="memory-recency-heading"
      title={title}
      subtitle={subtitle}
      bodyClassName="p-4 pt-3 min-w-0"
    >
      <div className="flex items-end gap-1.5 h-20" role="img" aria-label={subtitle}>
        {weeks.map((week) => (
          <div key={week.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-accent/80 transition-[height]"
              style={{ height: `${Math.max(8, (week.count / max) * 100)}%`, minHeight: week.count > 0 ? "0.5rem" : "0.25rem" }}
              title={`${week.label}: ${week.count}`}
            />
            <span className="text-[9px] text-muted truncate w-full text-center">{week.label}</span>
          </div>
        ))}
      </div>
    </InsightCard>
  );
}

function recentPreviewText(entry: ScopedMemoryEntry, t: (key: string) => string): string {
  const systemKey = systemMemoryLabelKey(entry);
  if (systemKey) return t(systemKey);
  return entry.value.length > 120 ? `${entry.value.slice(0, 117)}…` : entry.value;
}

export default function MemoryOverviewSection({
  stats,
  loading,
  onNeedsReviewClick,
  onCategorySliceClick,
  onSourceSliceClick,
  onBrowseAll,
  recentEntries,
}: MemoryOverviewSectionProps) {
  const { t } = useI18n();

  const categoryItems: SegmentDonutItem[] = stats.byCategoryDisplay.map((row) => ({
    id: row.isAggregatedOther ? "other" : row.category,
    label: row.isAggregatedOther
      ? OTHER_REASON_LABEL
      : t(`memories.categories.${row.category}`),
    count: row.count,
    color: row.isAggregatedOther ? "#94a3b8" : memoryCategoryColor(row.category),
  }));

  const sourceLabel = (bucket: MemorySourceBucket) => {
    if (bucket === "manual") return t("memories.overview.sourceManual");
    return t(`memories.groups.${bucket}`);
  };

  const sourceItems: SegmentDonutItem[] = stats.bySourceDisplay.map((row) => ({
    id: row.isAggregatedOther ? "other" : row.bucket,
    label: row.isAggregatedOther ? OTHER_REASON_LABEL : sourceLabel(row.bucket),
    count: row.count,
    color: row.isAggregatedOther ? "#94a3b8" : MEMORY_SOURCE_COLORS[row.bucket],
  }));

  const categorySliceById = new Map(
    stats.byCategoryDisplay.map((row) => [
      row.isAggregatedOther ? "other" : row.category,
      row,
    ]),
  );
  const sourceSliceById = new Map(
    stats.bySourceDisplay.map((row) => [row.isAggregatedOther ? "other" : row.bucket, row]),
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-bg-secondary" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-bg-secondary" />
          <div className="h-72 animate-pulse rounded-2xl bg-bg-secondary" />
        </div>
        <ListSkeleton rows={3} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricTile label={t("memories.overview.metrics.total")} value={stats.total} />
        <MetricTile
          label={t("memories.overview.metrics.needsReview")}
          value={stats.needsReview}
          emphasis={stats.needsReview > 0}
          onClick={stats.needsReview > 0 ? onNeedsReviewClick : undefined}
        />
        <MetricTile label={t("memories.overview.metrics.manual")} value={stats.manual} />
        <MetricTile
          label={t("memories.overview.metrics.updatedThisWeek")}
          value={stats.updatedLast7Days}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricTile label={t("memories.filters.aboutYou")} value={stats.aboutYou} compact />
        <MetricTile label={t("memories.filters.work")} value={stats.work} compact />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard
          id="memory-category-donut-heading"
          title={t("memories.overview.charts.byCategoryTitle")}
          subtitle={t("memories.overview.charts.byCategorySubtitle")}
          helpHint={t("memories.overview.charts.byCategoryHint")}
        >
          <SegmentDonut
            items={categoryItems}
            totalLabel={t("memories.overview.donutTotalLabel")}
            totalUnit={t("memories.overview.donutTotalUnit")}
            ariaLabel={t("memories.overview.categoryDonutAria", {
              total: stats.total,
              groups: categoryItems.length,
            })}
            emptyMessage={t("memories.overview.categoryDonutEmpty")}
            embeddedEmpty
            onSegmentClick={(item) => {
              const slice = categorySliceById.get(item.id as MemoryCategory | "other");
              if (slice) onCategorySliceClick(slice);
            }}
            renderLegend={(rows, hoverIdx) => (
              <DonutLegend
                rows={rows}
                hoverIdx={hoverIdx}
                getColor={(id) => rows.find((row) => row.id === id)?.color ?? "#94a3b8"}
                getLabel={(id) => rows.find((row) => row.id === id)?.label ?? id}
              />
            )}
          />
        </InsightCard>

        <InsightCard
          id="memory-source-donut-heading"
          title={t("memories.overview.charts.bySourceTitle")}
          subtitle={t("memories.overview.charts.bySourceSubtitle")}
          helpHint={t("memories.overview.charts.bySourceHint")}
        >
          <SegmentDonut
            items={sourceItems}
            totalLabel={t("memories.overview.donutTotalLabel")}
            totalUnit={t("memories.overview.donutTotalUnit")}
            ariaLabel={t("memories.overview.sourceDonutAria", {
              total: stats.total,
              groups: sourceItems.length,
            })}
            emptyMessage={t("memories.overview.sourceDonutEmpty")}
            embeddedEmpty
            onSegmentClick={(item) => {
              const slice = sourceSliceById.get(item.id as MemorySourceBucket | "other");
              if (slice) onSourceSliceClick(slice);
            }}
            renderLegend={(rows, hoverIdx) => (
              <DonutLegend
                rows={rows}
                hoverIdx={hoverIdx}
                getColor={(id) => rows.find((row) => row.id === id)?.color ?? "#94a3b8"}
                getLabel={(id) => rows.find((row) => row.id === id)?.label ?? id}
              />
            )}
          />
        </InsightCard>
      </div>

      <MemoryRecencySparkline
        weeks={stats.weeklyActivity}
        title={t("memories.overview.recencyTitle")}
        subtitle={t("memories.overview.recencySubtitle")}
      />

      {recentEntries.length > 0 ? (
        <section className="rounded-2xl border border-border/70 bg-bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{t("memories.overview.recentTitle")}</h3>
            <button
              type="button"
              onClick={onBrowseAll}
              className="text-xs font-medium text-accent hover:underline"
            >
              {t("memories.overview.browseAll")}
            </button>
          </div>
          <ul className="space-y-2">
            {recentEntries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-border-soft bg-bg-secondary/40 px-3 py-2"
              >
                <p className="text-sm text-text-primary leading-snug">{recentPreviewText(entry, t)}</p>
                <p className="mt-1 text-2xs text-muted">
                  {t(`memories.categories.${entry.category}`)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col items-center gap-2 pt-1">
        <p className="max-w-md text-center text-2xs text-muted">{t("memories.whyFromChat")}</p>
        <button
          type="button"
          onClick={onBrowseAll}
          className="rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-hover-overlay"
        >
          {t("memories.overview.browseAll")}
        </button>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  emphasis = false,
  compact = false,
  onClick,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const className = `rounded-xl border px-3 text-left transition-colors ${
    compact ? "py-2" : "py-3"
  } ${
    emphasis
      ? "border-accent/50 bg-accent/10 hover:bg-accent/15"
      : "border-border/70 bg-bg-card hover:bg-bg-secondary/60"
  } ${onClick ? "cursor-pointer" : ""}`;

  const inner = (
    <>
      <p className="text-2xs text-muted leading-snug">{label}</p>
      <p className={`font-bold tabular-nums text-text-primary ${compact ? "text-lg" : "text-2xl"}`}>
        {value}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}
