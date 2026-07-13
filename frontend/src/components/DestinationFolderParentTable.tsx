/** Grouped parent / destination breakdown for the queue destination card (see donut for per-slice chart). */

import { useMemo } from "react";
import { UNCERTAIN_FOLDER } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { folderDisplayLabel } from "../utils/format";
import { groupDestinationByParent, type ParentGroupLeaf } from "../utils/groupDestinationByParent";
import {
  isDestinationUncertainSliceColor,
  UNCERTAIN_DESTINATION_HATCH_CLASS,
} from "../utils/destinationFolderLegendColor";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Destination line: omit repeating the Area segment; show subpath with leading › when hierarchical. */
function leafDisplayInTable(
  leaf: ParentGroupLeaf,
  _parentKey: string,
  isSpecialBucket: boolean,
  t: Translate
): string {
  if (isSpecialBucket) {
    return folderDisplayLabel(leaf.fullPath, t);
  }
  const norm = leaf.fullPath.replace(/\\/g, "/").trim();
  if (!norm.includes("/")) {
    return t("queue.destFolderTableLeafSameAsArea");
  }
  const sub = folderDisplayLabel(leaf.leafLabel, t).trim();
  if (!sub) return "—";
  return `\u203a ${sub}`;
}

interface DestinationFolderParentTableProps {
  rows: { folder: string; count: number }[];
  getSliceColor: (folder: string, legendRowIndex: number) => string;
}

export default function DestinationFolderParentTable({
  rows,
  getSliceColor,
}: DestinationFolderParentTableProps) {
  const { t } = useI18n();
  const groups = useMemo(() => groupDestinationByParent(rows), [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="w-full min-w-0">
      <table className="w-full border-collapse text-left text-xs text-text-primary">
        <caption className="caption-top pb-2 text-2xs leading-snug text-muted text-left px-0.5">
          {t("queue.destFolderTableCaption")}
        </caption>
        <tbody>
          {groups.map((g) => (
            <tr
              key={g.parentKey}
              className="border-b border-border-soft/80 last:border-b-0 align-top"
            >
              <th
                scope="row"
                className="py-2.5 pr-3 align-top font-semibold text-text-primary min-w-[6.5rem] max-w-[11rem]"
                title={g.parentKey}
              >
                <span className="block truncate leading-tight">{folderDisplayLabel(g.parentKey, t)}</span>
                <span className="mt-0.5 block text-2xs font-normal tabular-nums text-muted normal-case tracking-normal">
                  {g.totalCount} {t("queue.donutTotalUnit")}
                </span>
              </th>
              <td className="py-2.5 pl-0 align-top min-w-0">
                <ul className="m-0 list-none p-0 min-w-0 flex flex-wrap items-start gap-x-4 gap-y-1.5">
                  {g.leaves.map((leaf) => {
                    const isUncertain = leaf.fullPath === UNCERTAIN_FOLDER;
                    const sliceColor = getSliceColor(leaf.fullPath, leaf.legendRowIndex);
                    const hatchLegend = isDestinationUncertainSliceColor(sliceColor);
                    return (
                      <li
                        key={`${leaf.fullPath}-${leaf.legendRowIndex}`}
                        className="flex items-center gap-1.5 min-w-0 max-w-full"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full border border-border/60 ${
                            hatchLegend ? UNCERTAIN_DESTINATION_HATCH_CLASS : ""
                          }`}
                          style={hatchLegend ? undefined : { backgroundColor: sliceColor }}
                          aria-hidden
                        />
                        <span className="min-w-0 inline-flex items-baseline gap-1">
                          <span
                            className={`break-words leading-snug ${isUncertain ? "font-medium text-text-primary" : ""}`}
                            title={leaf.fullPath}
                          >
                            {leafDisplayInTable(leaf, g.parentKey, g.isSpecialBucket, t)}
                          </span>
                          <span className="tabular-nums text-muted text-2xs">({leaf.count})</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
