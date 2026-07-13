import { useState } from "react";
import type { ModelStoragePartial } from "../../api";
import { formatBytes } from "../../utils/format";
import { SECONDARY_BTN_CLASS, DANGER_INLINE_CLASS, SECTION_LABEL_CLASS } from "../../utils/styles";
import HoverHelpCard from "../ui/HoverHelpCard";
import { useI18n } from "../../i18n/I18nContext";

function shortDigest(digestPrefix: string): string {
  const s = digestPrefix.trim();
  if (!s.startsWith("sha256-") || s.length < 24) return s;
  const hex = s.slice(7);
  if (hex.length <= 16) return s;
  return `sha256-${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

interface OllamaPartialsEmbedProps {
  id: string;
  dataTour?: string;
  panelTitle: string;
  partials: ModelStoragePartial[];
  totalPartialBytes: number;
  installingModel: boolean;
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  refresh: () => Promise<void>;
  deleteGroup: (digestPrefix: string) => Promise<void>;
  deletingId: string | null;
  prune: () => Promise<void>;
  pruning: boolean;
  pruneAvailable: boolean;
  ollamaHome: string | null;
  /** Show ollama data path footer (only one embed per page should). */
  showOllamaHomeFooter: boolean;
}

/**
 * Compact “incomplete download” card embedded under sort or vision model download UI.
 */
export default function OllamaPartialsEmbed({
  id,
  dataTour,
  panelTitle,
  partials,
  totalPartialBytes,
  installingModel,
  loading,
  error,
  setError,
  refresh,
  deleteGroup,
  deletingId,
  prune,
  pruning,
  pruneAvailable,
  ollamaHome,
  showOllamaHomeFooter,
}: OllamaPartialsEmbedProps) {
  const { t } = useI18n();
  const [confirmDigest, setConfirmDigest] = useState<string | null>(null);

  const partialSummaryText =
    partials.length === 1
      ? t("settings.ollamaPartials.partialSummaryOne", { size: formatBytes(totalPartialBytes) })
      : t("settings.ollamaPartials.partialSummary", {
          size: formatBytes(totalPartialBytes),
          count: partials.length,
        });

  return (
    <div id={id} className="mt-4 space-y-2" data-tour={dataTour} aria-label={t("settings.ollamaPartials.sectionAria")}>
      <HoverHelpCard hint={t("settings.ollamaPartials.hint")}>
        <p className={SECTION_LABEL_CLASS}>{panelTitle}</p>
      </HoverHelpCard>

      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border bg-bg-secondary/80">
          <p className="text-2xs text-muted">
            {loading ? t("settings.ollamaPartials.scanning") : partialSummaryText}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className={`${SECONDARY_BTN_CLASS} text-xs py-1 px-2`}
            >
              {t("settings.ollamaPartials.refresh")}
            </button>
            {pruneAvailable && (
              <button
                type="button"
                onClick={() => void prune()}
                disabled={pruning || installingModel}
                title={
                  installingModel
                    ? t("settings.ollamaPartials.waitDownloadPrune")
                    : t("settings.ollamaPartials.pruneTitle")
                }
                className="text-xs py-1 px-2 rounded-lg border border-accent-line text-accent hover:bg-accent-light/50 font-medium disabled:opacity-50"
              >
                {pruning ? t("settings.ollamaPartials.reclaiming") : t("settings.ollamaPartials.reclaim")}
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs text-error px-3 py-2 border-b border-border" role="alert">
            {error}{" "}
            <button type="button" className="underline" onClick={() => setError(null)}>
              {t("settings.ollamaPartials.dismiss")}
            </button>
          </p>
        )}

        {partials.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wider text-muted border-b border-border bg-bg-secondary/50">
                  <th className="px-3 py-2 font-semibold">{t("settings.ollamaPartials.colLayer")}</th>
                  <th className="px-3 py-2 font-semibold text-right">{t("settings.ollamaPartials.colSize")}</th>
                  <th className="px-3 py-2 font-semibold text-right">{t("settings.ollamaPartials.colFiles")}</th>
                  <th className="px-3 py-2 font-semibold text-right w-[1%]"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {partials.map((row: ModelStoragePartial) => (
                  <tr key={row.group_id} className="hover:bg-hover-overlay/40">
                    <td className="px-3 py-2 font-mono text-xs text-text-primary break-all" title={row.digest_prefix}>
                      {shortDigest(row.digest_prefix)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{formatBytes(row.total_bytes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{row.file_count}</td>
                    <td className="px-3 py-2 text-right">
                      {confirmDigest === row.digest_prefix ? (
                        <span className="inline-flex items-center gap-1 flex-wrap justify-end">
                          <button
                            type="button"
                            className={DANGER_INLINE_CLASS}
                            disabled={!!deletingId || installingModel}
                            onClick={() => {
                              void deleteGroup(row.digest_prefix);
                              setConfirmDigest(null);
                            }}
                          >
                            {t("settings.ollamaPartials.confirmDelete")}
                          </button>
                          <button
                            type="button"
                            className="text-2xs text-muted hover:text-text-primary"
                            onClick={() => setConfirmDigest(null)}
                          >
                            {t("settings.ollamaPartials.cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={DANGER_INLINE_CLASS}
                          disabled={!!deletingId || installingModel}
                          title={
                            installingModel
                              ? t("settings.ollamaPartials.waitDownloadDelete")
                              : t("settings.ollamaPartials.deleteLayerTitle")
                          }
                          onClick={() => setConfirmDigest(row.digest_prefix)}
                        >
                          {deletingId === row.digest_prefix ? "…" : t("settings.ollamaPartials.delete")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showOllamaHomeFooter && ollamaHome ? (
          <p className="text-2xs text-muted px-3 py-2 border-t border-border bg-bg-secondary/30">
            {t("settings.ollamaPartials.ollamaData")}{" "}
            <span className="font-mono opacity-80 break-all">{ollamaHome}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
