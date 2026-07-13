import { useEffect, useState } from "react";
import { SORT_FLOW_STRIP_DISMISSED_KEY } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import SortHelpModal from "./SortHelpModal";

interface SortFlowStripProps {
  /** Hide strip after a job completes (user finished a full cycle). */
  jobCompleted: boolean;
  onOpenTour: () => void;
  onOpenSortingSettings?: () => void;
}

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(SORT_FLOW_STRIP_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismiss() {
  try {
    localStorage.setItem(SORT_FLOW_STRIP_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Dismissible “how sorting works” strip on the Sort tab. */
export default function SortFlowStrip({ jobCompleted, onOpenTour, onOpenSortingSettings }: SortFlowStripProps) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (jobCompleted) {
      persistDismiss();
      setDismissed(true);
    }
  }, [jobCompleted]);

  if (dismissed) return null;

  const dismiss = () => {
    persistDismiss();
    setDismissed(true);
  };

  return (
    <>
      <section
        data-tour="sort-flow-strip"
        className="relative min-w-0 w-full overflow-hidden rounded-xl border border-border bg-bg-card/80 px-3 py-3 sm:px-4 sm:py-4 scroll-mt-28"
        role="region"
        aria-label={t("queue.sortFlowStripAria")}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          aria-hidden
          style={{
            background:
              "radial-gradient(900px 280px at 12% -20%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 55%), radial-gradient(600px 200px at 88% 110%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3 gap-y-2">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent shadow-inner ring-1 ring-accent-line/45"
                aria-hidden
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM14.25 8.25a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 8.25V18a2.25 2.25 0 0 1-2.25 2.25h-1.5A2.25 2.25 0 0 1 14.25 18V8.25ZM3.75 16.5a2.25 2.25 0 0 1 2.25-2.25h1.5a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25h-1.5a2.25 2.25 0 0 1-2.25-2.25v-1.5Z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-2xs font-bold uppercase tracking-[0.14em] text-muted">
                  {t("queue.sortFlowStripTitle")}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-text-primary">{t("queue.sortFlowStripIntro")}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={onOpenTour}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-accent-line bg-accent-light px-3 text-xs font-semibold text-accent shadow-sm transition-colors hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {t("queue.sortFlowStripTour")}
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-bg-secondary/90 px-3 text-xs font-medium text-text-primary shadow-sm transition-colors hover:bg-hover-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {t("queue.sortFlowStripHelp")}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex h-9 items-center px-2 text-xs font-medium text-muted transition-colors hover:text-text-primary"
              >
                {t("queue.sortFlowStripDismiss")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <SortHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onOpenTour={onOpenTour}
        onOpenSortingSettings={onOpenSortingSettings}
      />
    </>
  );
}
