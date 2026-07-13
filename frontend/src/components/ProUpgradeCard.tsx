import { useI18n } from "../i18n/I18nContext";

interface ProUpgradeCardProps {
  /** Plain-language outcome describing what the locked feature does (already localized). */
  description: string;
  /** Opens the license section so the user can unlock — never a dead end. */
  onUpgrade: () => void;
  /** Tighter padding for inline placement inside a panel. */
  compact?: boolean;
}

/**
 * Upgrade prompt shown where a paid (proactive) feature would otherwise act.
 * Always states what the feature does plus the path to unlock it.
 */
export default function ProUpgradeCard({ description, onUpgrade, compact }: ProUpgradeCardProps) {
  const { t } = useI18n();
  return (
    <div
      className={`rounded-xl border border-accent-line bg-accent-soft/40 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-button-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              {t("pro.badge")}
            </span>
            <p className="text-sm font-semibold text-text-primary">{t("pro.title")}</p>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-button-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        {t("pro.cta")}
      </button>
    </div>
  );
}
