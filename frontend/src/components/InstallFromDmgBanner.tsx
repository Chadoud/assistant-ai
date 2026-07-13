import { useI18n } from "../i18n/I18nContext";

interface InstallFromDmgBannerProps {
  onOpenApplications: () => void;
  onDismiss: () => void;
}

/**
 * Shown when the Mac app is launched from a mounted .dmg instead of /Applications.
 */
export default function InstallFromDmgBanner({
  onOpenApplications,
  onDismiss,
}: InstallFromDmgBannerProps) {
  const { t } = useI18n();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-10 z-40 flex justify-center px-4"
      role="status"
    >
      <div className="pointer-events-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-accent/40 bg-bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
        <p className="min-w-0 flex-1 text-sm leading-snug text-text-primary">
          {t("welcome.installFromDmgBody")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenApplications}
            className="rounded-xl bg-button-primary px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
          >
            {t("welcome.installFromDmgAction")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl px-2 py-1.5 text-sm text-muted transition-colors hover:text-text-primary"
          >
            {t("welcome.installFromDmgNotNow")}
          </button>
        </div>
      </div>
    </div>
  );
}
