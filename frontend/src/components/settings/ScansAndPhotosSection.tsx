import type { OCRCapabilities } from "../../types/electron";
import type { AppSettings } from "../../types/settings";
import type { EntitlementStatus } from "../../api";
import VisionFallbackSection from "./VisionFallbackSection";
import { OcrStatusBadge } from "../ui/StatusBadge";
import { CARD_SHELL_CLASS, SECTION_LABEL_CLASS } from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";

interface ScansAndPhotosSectionProps {
  settings: AppSettings;
  ocrInfo: OCRCapabilities | null;
  backendOnline: boolean;
  models: string[];
  loadingModels: boolean;
  onOpenVisionModelsSettings?: () => void;
  entitlement?: EntitlementStatus | null;
  ocrSearch: string;
  setOcrSearch: (value: string) => void;
  ocrCatalogRows: { code: string; label: string }[];
  textInstalledLangs: string[];
  effectiveOcrCodes: string[];
  toggleOcrLanguagePack: (code: string) => void;
  onUseAllInstalledOcr: () => void;
  osdOnly: boolean;
}

/**
 * Scans & photos — outcome-first status with optional language management (no engine dump).
 */
export default function ScansAndPhotosSection({
  settings,
  ocrInfo,
  backendOnline,
  models,
  loadingModels,
  onOpenVisionModelsSettings,
  entitlement,
  ocrSearch,
  setOcrSearch,
  ocrCatalogRows,
  textInstalledLangs,
  effectiveOcrCodes,
  toggleOcrLanguagePack,
  onUseAllInstalledOcr,
  osdOnly,
}: ScansAndPhotosSectionProps) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive(entitlement);

  const scanReady = ocrInfo?.status === "ready";
  const statusLine = !ocrInfo
    ? t("settings.scans.checking")
    : scanReady
      ? t("settings.scans.ready")
      : t("settings.scans.needsAttention");

  return (
    <div id="sorting-scans" className="scroll-mt-24 space-y-4" data-tour="settings-ocr-packs">
      <div className={`${CARD_SHELL_CLASS} px-4 py-3 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <p className="text-sm font-medium text-text-primary">{t("settings.nav.sortingScans")}</p>
          <p className="text-xs text-muted mt-0.5">{statusLine}</p>
        </div>
        {ocrInfo ? <OcrStatusBadge status={ocrInfo.status} /> : null}
      </div>

      {!cloudSortActive ? (
        <div className="rounded-xl border border-border bg-bg-card p-4" data-tour="settings-vision-fallback">
          <VisionFallbackSection
            visionModel={settings.visionModel}
            backendOnline={backendOnline}
            models={models}
            loadingModels={loadingModels}
            onOpenVisionModelsSettings={onOpenVisionModelsSettings}
            entitlement={entitlement}
          />
        </div>
      ) : null}

      <details className="rounded-xl border border-border bg-bg-card group/scans-lang">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-text-primary hover:bg-hover-overlay rounded-xl [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
          <span>{t("settings.scans.manageLanguages")}</span>
          <span className="text-2xs text-muted font-normal group-open/scans-lang:hidden">
            {t("settings.scans.manageLanguagesHint")}
          </span>
        </summary>
        <div className="border-t border-border px-4 py-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="settings-ocr-search" className={SECTION_LABEL_CLASS}>
              {t("settings.ocrPacks")}
            </label>
            <button
              type="button"
              onClick={onUseAllInstalledOcr}
              className="text-2xs font-medium text-accent hover:underline"
            >
              {t("settings.ocrUseAllInstalled")}
            </button>
          </div>
          {osdOnly ? <p className="text-2xs text-warning">{t("settings.osdOnlyWarning")}</p> : null}
          <input
            id="settings-ocr-search"
            type="search"
            value={ocrSearch}
            onChange={(e) => setOcrSearch(e.target.value)}
            placeholder={t("settings.ocrSearchPlaceholder")}
            className="w-full max-w-md rounded border border-border bg-bg-card px-2 py-1.5 text-sm text-text-primary"
          />
          <div
            id="settings-ocr-langs"
            role="group"
            aria-label={t("settings.ocrPacks")}
            className="max-h-[min(40vh,18rem)] overflow-y-auto rounded border border-border bg-bg-card px-2 py-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
              {ocrCatalogRows.map(({ code, label }) => {
                const installedHere = textInstalledLangs.includes(code);
                const checked = effectiveOcrCodes.includes(code);
                return (
                  <label
                    key={code}
                    className="flex items-start gap-2 cursor-pointer text-text-primary select-none py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOcrLanguagePack(code)}
                      className="rounded border-border shrink-0 mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium leading-tight">{label}</span>
                      <span className="text-2xs text-muted">
                        {installedHere ? t("settings.ocrInstalled") : t("settings.ocrNotOnDisk")}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
