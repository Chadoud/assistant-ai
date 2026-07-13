import { useI18n } from "../../i18n/I18nContext";

interface ProTabBannerProps {
  description: string;
  onUpgrade: () => void;
}

/**
 * Single upgrade banner per tab — replaces repeated ProUpgradeCard blocks in sub-sections.
 */
export default function ProTabBanner({ description, onUpgrade }: ProTabBannerProps) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-accent-line bg-accent-soft/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-button-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              {t("pro.badge")}
            </span>
            <p className="text-sm font-semibold text-text-primary">{t("pro.title")}</p>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">{description}</p>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="shrink-0 rounded-lg bg-button-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("pro.cta")}
        </button>
      </div>
    </div>
  );
}
