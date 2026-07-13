import type { CSSProperties } from "react";
import { useI18n } from "../i18n/I18nContext";

interface SortHelpModalProps {
  open: boolean;
  onClose: () => void;
  onOpenTour: () => void;
  onOpenSortingSettings?: () => void;
}

const BASICS_KEYS = ["step1", "step2", "step3"] as const;
const GROUPING_KEYS = ["groupingBuiltin", "groupingStructure", "groupingCustom"] as const;
const TIP_KEYS = ["tipOutput", "tipCopyMove", "tipOcr"] as const;

export default function SortHelpModal({
  open,
  onClose,
  onOpenTour,
  onOpenSortingSettings,
}: SortHelpModalProps) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sort-help-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-overlay-scrim backdrop-blur-[2px]"
        aria-label={t("sortHelp.close")}
        onClick={onClose}
      />
      <div
        className="relative flex w-full max-w-lg max-h-[min(90vh,640px)] flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-accent-glow"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-3xs font-bold uppercase tracking-widest text-muted">{t("sortHelp.eyebrow")}</p>
              <h2 id="sort-help-title" className="text-lg font-semibold text-text-primary">
                {t("sortHelp.title")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t("sortHelp.intro")}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-hover-overlay hover:text-text-primary"
              aria-label={t("sortHelp.close")}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <section className="mb-5">
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-widest text-muted">{t("sortHelp.sectionBasics")}</h3>
            <ol className="space-y-3 text-sm">
              {BASICS_KEYS.map((key, index) => (
                <li key={key} className="flex gap-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-[11px] font-bold tabular-nums text-accent ring-1 ring-accent-line/40"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="font-medium text-text-primary">{t(`sortHelp.${key}`)}</p>
                    <p className="mt-0.5 leading-relaxed text-muted">{t(`sortHelp.${key}Body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-5 rounded-xl border border-border bg-bg-secondary p-4">
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-widest text-muted">
              {t("sortHelp.sectionGrouping")}
            </h3>
            <p className="mb-3 text-sm leading-relaxed text-muted">{t("sortHelp.groupingIntro")}</p>
            <ul className="space-y-2 text-sm text-muted">
              {GROUPING_KEYS.map((key) => (
                <li key={key} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span>{t(`sortHelp.${key}`)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-widest text-muted">{t("sortHelp.sectionRules")}</h3>
            <p className="text-sm leading-relaxed text-muted">{t("sortHelp.rulesBody")}</p>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-widest text-muted">{t("sortHelp.sectionSources")}</h3>
            <p className="text-sm leading-relaxed text-muted">{t("sortHelp.sourcesBody")}</p>
          </section>

          <section className="mb-5 rounded-xl border border-border bg-bg-secondary p-4">
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-widest text-muted">{t("sortHelp.sectionTips")}</h3>
            <ul className="space-y-2 text-sm text-muted">
              {TIP_KEYS.map((key) => (
                <li key={key} className="list-disc pl-4 marker:text-accent">
                  {t(`sortHelp.${key}`)}
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border-soft pt-4">
            {onOpenSortingSettings ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSortingSettings();
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {t("sortHelp.openSettings")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTour();
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t("sortHelp.replayTour")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-button-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-button-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t("sortHelp.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
