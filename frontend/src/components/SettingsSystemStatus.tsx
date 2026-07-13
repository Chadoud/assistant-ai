import { useMemo } from "react";
import type { OCRCapabilities } from "../types/electron";
import type { AppSettings } from "../types/settings";
import VisionFallbackSection from "./settings/VisionFallbackSection";
import SectionHeader from "./ui/SectionHeader";
import { tessLangDisplayLabel } from "../utils/tesseractLangCatalog";
import { OcrStatusBadge } from "./ui/StatusBadge";
import { CARD_SHELL_CLASS } from "../utils/styles";
import { useI18n } from "../i18n/I18nContext";
import { useCloudSortActive } from "../hooks/useCloudSortActive";
import type { EntitlementStatus } from "../api";

interface SettingsSystemStatusProps {
  backendOnline: boolean;
  backendHealthProbing: boolean;
  modelCount: number;
  loadingModels: boolean;
  ocrInfo: OCRCapabilities | null;
  collapsed: Set<string>;
  onToggleSection: (id: string) => void;
  settings: Pick<AppSettings, "visionModel">;
  models: string[];
  onOpenVisionModelsSettings?: () => void;
  entitlement?: EntitlementStatus | null;
}

function StatusChip({
  label,
  status,
  detail,
}: {
  label: string;
  status: "ok" | "warn" | "error" | "loading";
  detail: string;
}) {
  const dot =
    status === "ok"
      ? "bg-success animate-pulse"
      : status === "warn"
      ? "bg-warning"
      : status === "error"
      ? "bg-error"
      : "bg-muted animate-pulse";
  const ring =
    status === "ok"
      ? "border-success-line bg-success-soft"
      : status === "warn"
      ? "border-warning-line bg-warning-soft"
      : status === "error"
      ? "border-error-line bg-error-soft"
      : "border-border bg-bg-secondary";
  const detailTone =
    status === "ok"
      ? "text-success"
      : status === "warn"
      ? "text-warning"
      : status === "error"
      ? "text-error"
      : "text-muted";
  return (
    <div className={`flex-1 rounded-xl border p-3 flex flex-col gap-1.5 ${ring}`}>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="text-xs font-semibold text-text-primary">{label}</span>
      </div>
      <p className={`text-3xs leading-snug font-medium ${detailTone}`}>{detail}</p>
    </div>
  );
}

export default function SettingsSystemStatus({
  backendOnline,
  backendHealthProbing,
  modelCount,
  loadingModels,
  ocrInfo,
  collapsed,
  onToggleSection,
  settings,
  models,
  onOpenVisionModelsSettings,
  entitlement,
}: SettingsSystemStatusProps) {
  const { t } = useI18n();
  const { cloudSortActive, loading: cloudSortLoading } = useCloudSortActive(entitlement);

  const backendChip = useMemo(() => {
    if (backendHealthProbing) {
      return { status: "loading" as const, detail: t("api.settingsChecking") };
    }
    if (backendOnline) {
      return { status: "ok" as const, detail: t("api.settingsReady") };
    }
    return { status: "error" as const, detail: t("api.settingsOffline") };
  }, [backendHealthProbing, backendOnline, t]);

  const modelStatus = loadingModels || cloudSortLoading
    ? "loading"
    : cloudSortActive
      ? "ok"
      : modelCount > 0
        ? "ok"
        : "error";
  const modelDetail = loadingModels || cloudSortLoading
    ? t("systemStatus.checking")
    : cloudSortActive
      ? t("systemStatus.cloudSortLlm")
      : modelCount > 0
        ? modelCount === 1
          ? t("systemStatus.modelsInstalledOne")
          : t("systemStatus.modelsInstalled", { count: modelCount })
        : t("systemStatus.noModels");

  const modelLabel = cloudSortActive ? t("systemStatus.sortLlm") : t("systemStatus.aiModel");

  const ocrStatus =
    !ocrInfo
      ? "loading"
      : ocrInfo.status === "ready"
      ? "ok"
      : ocrInfo.status === "partial"
      ? "warn"
      : "error";
  const ocrDetail = !ocrInfo
    ? t("systemStatus.checking")
    : ocrInfo.tesseractInstalled
    ? t("systemStatus.tesseractLine", {
        version: ocrInfo.tesseractVersion ?? t("systemStatus.installed"),
        count: ocrInfo.languages.length,
      })
    : `${t("systemStatus.tesseract")} ${t("systemStatus.notFound")}`;

  return (
    <>
      {/* System Status */}
      <section>
        <SectionHeader
          id="system-status"
          label={t("systemStatus.sectionTitle")}
          collapsed={collapsed.has("system-status")}
          onToggle={onToggleSection}
        />
        {!collapsed.has("system-status") && (
          <div className="flex gap-3">
            <StatusChip
              label={t("systemStatus.backend")}
              status={backendChip.status}
              detail={backendChip.detail}
            />
            <StatusChip label={modelLabel} status={modelStatus} detail={modelDetail} />
            <StatusChip label={t("systemStatus.ocrShort")} status={ocrStatus} detail={ocrDetail} />
          </div>
        )}
      </section>

      {/* OCR Capability */}
      <section>
        <SectionHeader
          id="ocr"
          label={t("systemStatus.ocrSection")}
          collapsed={collapsed.has("ocr")}
          onToggle={onToggleSection}
        />
        {!collapsed.has("ocr") && (
          !ocrInfo ? (
            <p className="text-xs text-muted">{t("systemStatus.ocrChecking")}</p>
          ) : (
            <div className={`${CARD_SHELL_CLASS} divide-y divide-border`}>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-text-primary">{t("systemStatus.status")}</span>
                <OcrStatusBadge status={ocrInfo.status} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">{t("systemStatus.tesseract")}</span>
                <span className={`text-xs font-medium ${ocrInfo.tesseractInstalled ? "text-text-primary" : "text-error"}`}>
                  {ocrInfo.tesseractInstalled
                    ? ocrInfo.tesseractVersion || t("systemStatus.installed")
                    : t("systemStatus.notFound")}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="text-sm text-muted shrink-0">{t("systemStatus.languages")}</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {ocrInfo.languages.length > 0 ? (
                    [...ocrInfo.languages]
                      .map((code) => {
                        const label = tessLangDisplayLabel(code);
                        return { code, label };
                      })
                      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
                      .map(({ code, label }) => (
                        <span
                          key={code}
                          title={label !== code ? `Tesseract: ${code}` : undefined}
                          className="text-2xs px-1.5 py-0.5 rounded bg-surface-subtle text-text-primary max-w-[12rem] truncate"
                        >
                          {label}
                        </span>
                      ))
                  ) : (
                    <span className="text-xs text-muted">{t("systemStatus.noneDetected")}</span>
                  )}
                </div>
              </div>
              <div data-tour="settings-vision-fallback">
                <VisionFallbackSection
                  visionModel={settings.visionModel}
                  backendOnline={backendOnline}
                  models={models}
                  loadingModels={loadingModels}
                  onOpenVisionModelsSettings={onOpenVisionModelsSettings}
                  entitlement={entitlement}
                />
              </div>
              {ocrInfo.status !== "ready" && (
                <div className="px-4 py-3">
                  <p className="text-xs text-muted">{t("systemStatus.installHint")}</p>
                </div>
              )}
            </div>
          )
        )}
      </section>
    </>
  );
}
