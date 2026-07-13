/** Donut + parent/destination table for files grouped by suggested/final destination (review queue). */

import { useCallback, useMemo, useState } from "react";
import DestinationFolderParentTable from "./DestinationFolderParentTable";
import SegmentDonut, { type SegmentDonutItem } from "./charts/SegmentDonut";
import { useI18n } from "../i18n/I18nContext";
import { folderDisplayLabel } from "../utils/format";
import {
  destinationFolderSliceColor,
  isDestinationUncertainSliceColor,
} from "../utils/destinationFolderLegendColor";

interface DestinationFolderDonutProps {
  items: { folder: string; count: number }[];
  itemsFull: { folder: string; count: number }[];
  className?: string;
  embedded?: boolean;
}

export default function DestinationFolderDonut({
  items,
  itemsFull,
  className = "",
  embedded = false,
}: DestinationFolderDonutProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const legendRows = expanded ? itemsFull : items;
  const canExpand = itemsFull.length > items.length;
  const total = items.reduce((sum, item) => sum + item.count, 0);

  const segmentItems: SegmentDonutItem[] = useMemo(
    () =>
      items.map((item, index) => {
        const sliceColor = destinationFolderSliceColor(item.folder, index);
        return {
          id: item.folder,
          label: folderDisplayLabel(item.folder, t),
          count: item.count,
          color: sliceColor,
          uncertainHatch: isDestinationUncertainSliceColor(sliceColor),
        };
      }),
    [items, t],
  );

  const getSliceColor = useCallback(
    (folder: string, legendRowIndex: number) => {
      const idx = items.findIndex((item) => item.folder === folder);
      if (idx >= 0) return destinationFolderSliceColor(folder, idx);
      return destinationFolderSliceColor(folder, legendRowIndex);
    },
    [items],
  );

  return (
    <div className={className}>
      <SegmentDonut
        items={segmentItems}
        totalLabel={t("queue.donutTotalLabel")}
        totalUnit={t("queue.donutTotalUnit")}
        ariaLabel={t("queue.donutAria", { total, groups: items.length })}
        emptyMessage={embedded ? t("queue.donutEmptyEmbedded") : t("queue.donutEmpty")}
        embeddedEmpty={embedded}
        renderLegend={() => (
          <div className="w-full px-0.5">
            <DestinationFolderParentTable rows={legendRows} getSliceColor={getSliceColor} />
          </div>
        )}
      />

      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-4 text-2xs font-medium text-accent hover:underline mx-auto block"
          aria-expanded={expanded}
        >
          {expanded ? t("queue.donutShowTopOnly") : t("queue.donutShowAll", { count: itemsFull.length })}
        </button>
      ) : null}

      {expanded && canExpand ? (
        <p className="sr-only" role="status">
          {t("queue.donutExpandedSr", { count: itemsFull.length })}
        </p>
      ) : null}
    </div>
  );
}
