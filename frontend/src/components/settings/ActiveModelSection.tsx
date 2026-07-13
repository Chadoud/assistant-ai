import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AppSettings } from "../../types/settings";
import { api } from "../../api";
import type { SortStatusResponse } from "../../api/models";
import { findPreset, normalizeModel, type SpeedTier } from "../../utils/modelCatalogue";
import {
  isModelReportedByOllama,
  resolveSortModelDisplayName,
} from "../../utils/sortChatInstalledModels";
import { isVisionCapableModelName, resolveVisionModelClient } from "../../utils/visionModels";
import { CARD_SHELL_CLASS, SECONDARY_BTN_CLASS } from "../../utils/styles";
import SectionHeader from "../ui/SectionHeader";
import { StatusToneBadge } from "../ui/StatusBadge";
import { useI18n } from "../../i18n/I18nContext";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";
import {
  useCloudSortConnectionStatus,
  type CloudSortConnectionStatus,
} from "../../hooks/useCloudSortConnectionStatus";
import type { EntitlementStatus } from "../../api";

function SpeedBadge({ speed, t }: { speed: SpeedTier; t: (k: string) => string }) {
  const tone =
    speed === "fast" ? "success" : speed === "medium" ? "warning" : "error";
  const label =
    speed === "fast"
      ? t("settings.models.speedFast")
      : speed === "medium"
        ? t("settings.models.speedMedium")
        : t("settings.models.speedSlow");
  return <StatusToneBadge tone={tone}>{label}</StatusToneBadge>;
}

function connectionStatusBadge(
  status: CloudSortConnectionStatus,
  t: (k: string) => string,
): ReactNode {
  switch (status) {
    case "connected":
      return (
        <StatusToneBadge tone="success">{t("settings.activeModels.statusConnected")}</StatusToneBadge>
      );
    case "connecting":
    case "checking":
      return (
        <StatusToneBadge tone="warning">{t("settings.activeModels.statusConnecting")}</StatusToneBadge>
      );
    case "offline":
      return (
        <StatusToneBadge tone="warning">{t("settings.activeModels.statusOffline")}</StatusToneBadge>
      );
    case "unavailable":
      return (
        <StatusToneBadge tone="error">{t("settings.activeModels.statusUnavailable")}</StatusToneBadge>
      );
    default:
      return null;
  }
}

const ROLE_LABEL_CLASS = "text-2xs font-semibold text-muted uppercase tracking-wider";

function ActiveModelCard({
  title,
  modelName,
  preset,
  footerHint,
  statusBadge,
  hideCustomUnknown = false,
  t,
  gbUnit,
  className = "",
  onActivate,
  activateHint,
}: {
  title: string;
  modelName: ReactNode;
  preset: ReturnType<typeof findPreset> | undefined;
  footerHint?: string;
  statusBadge?: ReactNode;
  hideCustomUnknown?: boolean;
  t: (k: string, vars?: Record<string, string | number>) => string;
  gbUnit: string;
  className?: string;
  onActivate?: () => void;
  activateHint?: string;
}) {
  const isPlainString = typeof modelName === "string";
  const noneSelected = t("settings.activeModels.noneSelected");
  const showCustomUnknown =
    !preset &&
    isPlainString &&
    Boolean(modelName) &&
    modelName !== noneSelected;

  const shellClass = `${CARD_SHELL_CLASS} p-4 min-w-0 flex flex-col h-full ${className}`.trim();

  const inner = (
    <>
      <div className="flex min-h-[5.75rem] flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className={ROLE_LABEL_CLASS}>{title}</p>
          {statusBadge ? <div className="shrink-0">{statusBadge}</div> : null}
        </div>
        <div
          className={`mt-2 text-sm font-semibold text-text-primary min-w-0 ${
            isPlainString ? "truncate" : "whitespace-normal"
          }`}
        >
          {modelName}
        </div>
        {preset ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-3xs px-1.5 py-0.5 rounded bg-surface-subtle text-muted font-medium">
                {preset.sizeGb} {gbUnit}
              </span>
              <span className="text-3xs px-1.5 py-0.5 rounded bg-surface-subtle text-muted font-medium">
                {t("settings.activeModels.ramRange", { min: preset.minRamGb, max: preset.recRamGb })}
              </span>
              <SpeedBadge speed={preset.speed} t={t} />
            </div>
          </>
        ) : showCustomUnknown && !hideCustomUnknown ? (
          <p className="text-3xs text-muted mt-2">{t("settings.activeModels.customUnknown")}</p>
        ) : null}
      </div>
      {footerHint || (onActivate && activateHint) ? (
        <div className="mt-auto shrink-0 space-y-2 border-t border-border-soft pt-2">
          {footerHint ? <p className="text-2xs text-muted leading-snug">{footerHint}</p> : null}
          {onActivate && activateHint ? (
            <p className="text-2xs text-accent font-medium">{activateHint}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
  if (onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className={`${shellClass} w-full text-left transition-colors hover:border-accent/50 hover:bg-hover-overlay/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-xl`}
      >
        {inner}
      </button>
    );
  }
  return <div className={shellClass}>{inner}</div>;
}

interface ActiveModelSectionProps {
  settings: AppSettings;
  installedModels: string[];
  collapsed: Set<string>;
  onToggleSection: (id: string) => void;
  onOpenSortDownload?: () => void;
  onOpenSortInstalledBrowse?: () => void;
  onRefreshModels?: () => void;
  refreshModelsLoading?: boolean;
  cloudSortActive?: boolean;
  entitlement?: EntitlementStatus | null;
  backendOnline?: boolean;
}

/** Sort + vision models — one card per role, row layout on wide screens. */
export default function ActiveModelSection({
  settings,
  installedModels,
  collapsed,
  onToggleSection,
  onOpenSortDownload,
  onOpenSortInstalledBrowse,
  onRefreshModels,
  refreshModelsLoading = false,
  cloudSortActive: cloudSortActiveProp,
  entitlement,
  backendOnline = false,
}: ActiveModelSectionProps) {
  const { t } = useI18n();
  const { cloudSortActive: cloudFromHook } = useCloudSortActive(entitlement);
  const cloudSortActive = cloudSortActiveProp ?? cloudFromHook;
  const cloudConnectionStatus = useCloudSortConnectionStatus({
    enabled: cloudSortActive,
    backendOnline,
    entitlement,
  });

  const [sortStatus, setSortStatus] = useState<SortStatusResponse | null>(null);

  useEffect(() => {
    if (!cloudSortActive || !backendOnline) {
      setSortStatus(null);
      return;
    }
    let cancelled = false;
    void api
      .sortStatus(settings.model.trim() || undefined, settings.visionModel.trim() || undefined)
      .then((status) => {
        if (!cancelled) setSortStatus(status);
      })
      .catch(() => {
        if (!cancelled) setSortStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cloudSortActive, backendOnline, settings.model, settings.visionModel]);

  const sortPreset = findPreset(settings.model);
  const visionTrim = settings.visionModel.trim();
  const resolvedVision = resolveVisionModelClient(installedModels, visionTrim || null);
  const visionPresetForCard = visionTrim
    ? findPreset(visionTrim)
    : resolvedVision
      ? findPreset(resolvedVision)
      : undefined;

  const gbUnit = t("settings.activeModels.gb");

  const visionPrimary: ReactNode = visionTrim
    ? visionTrim
    : resolvedVision
      ? resolvedVision
      : (
          <span className="text-muted">{t("settings.activeModels.noVisionInstalled")}</span>
        );

  const sortName = settings.model.trim();
  const sortInstalledLocally =
    Boolean(sortName) &&
    (isModelReportedByOllama(installedModels, sortName) || isVisionCapableModelName(sortName));
  const sortNotInOllamaList =
    !cloudSortActive &&
    Boolean(sortName) &&
    !isVisionCapableModelName(sortName) &&
    !isModelReportedByOllama(installedModels, sortName);
  const visionResolvedName = visionTrim || resolvedVision || "";
  const sameModelBothRoles =
    !!sortName &&
    !!visionResolvedName &&
    normalizeModel(sortName) === normalizeModel(visionResolvedName);

  const visionFooterHint = resolvedVision
    ? t("settings.activeModels.visionAutoModeHint")
    : sameModelBothRoles
      ? t("settings.activeModels.footerSameModel")
      : undefined;

  const cloudSortDisplayName =
    sortStatus?.classify_model ?? resolveSortModelDisplayName(installedModels, sortName);

  const cloudVisionDisplayName =
    sortStatus?.vision_model ??
    (visionTrim || resolvedVision || null);

  const entitledModelsLine = useMemo(() => {
    const fromEntitlement = entitlement?.sortEntitledModels?.filter(Boolean) ?? [];
    if (fromEntitlement.length > 0) {
      return fromEntitlement.join(", ");
    }
    const fromGateway = [
      ...(sortStatus?.installed_text_models ?? []),
      ...(sortStatus?.installed_vision_models ?? []),
      ...(sortStatus?.installed_embed_models ?? []),
    ];
    return [...new Set(fromGateway)].join(", ");
  }, [entitlement?.sortEntitledModels, sortStatus]);

  const cloudStatusBadge = connectionStatusBadge(cloudConnectionStatus, t);

  const localSortBadge = sortInstalledLocally ? (
    <StatusToneBadge tone="success">{t("settings.activeModels.statusReady")}</StatusToneBadge>
  ) : sortName ? (
    <StatusToneBadge tone="warning">{t("settings.activeModels.statusNeedsModel")}</StatusToneBadge>
  ) : (
    <StatusToneBadge tone="warning">{t("settings.activeModels.statusNeedsModel")}</StatusToneBadge>
  );

  const localVisionBadge = resolvedVision ? (
    <StatusToneBadge tone="success">{t("settings.activeModels.statusReady")}</StatusToneBadge>
  ) : (
    <StatusToneBadge tone="warning">{t("settings.activeModels.statusOptional")}</StatusToneBadge>
  );

  return (
    <section data-tour="settings-models-active" aria-label={t("settings.activeModels.sectionAria")}>
      <SectionHeader
        id="active-model"
        label={cloudSortActive ? t("settings.activeModels.sectionTitleCloud") : t("settings.activeModels.sectionTitle")}
        collapsed={collapsed.has("active-model")}
        onToggle={onToggleSection}
      />
      {!collapsed.has("active-model") && (
        <div className="space-y-3">
          <div className="flex flex-row flex-wrap gap-3 items-stretch">
            <ActiveModelCard
              className="flex-1 min-w-[min(100%,260px)]"
              title={cloudSortActive ? t("settings.activeModels.sortTitleCloud") : t("settings.activeModels.sortChatTitle")}
              modelName={
                cloudSortActive
                  ? cloudSortDisplayName
                  : settings.model || <span className="text-muted">{t("settings.activeModels.noneSelected")}</span>
              }
              preset={cloudSortActive ? undefined : sortPreset}
              statusBadge={cloudSortActive ? cloudStatusBadge : localSortBadge}
              hideCustomUnknown={cloudSortActive}
              t={t}
              gbUnit={gbUnit}
              footerHint={
                cloudSortActive
                  ? entitledModelsLine
                    ? t("settings.activeModels.footerSortCloudWithAccount", {
                        model: cloudSortDisplayName,
                        models: entitledModelsLine,
                      })
                    : t("settings.activeModels.footerSortCloud", { model: cloudSortDisplayName })
                  : sortNotInOllamaList
                  ? t("settings.activeModels.sortNotInOllamaList")
                  : onOpenSortInstalledBrowse || onOpenSortDownload
                    ? undefined
                    : t("settings.activeModels.footerSortChat")
              }
              onActivate={cloudSortActive ? undefined : onOpenSortInstalledBrowse ?? onOpenSortDownload}
              activateHint={
                onOpenSortInstalledBrowse
                  ? t("settings.activeModels.tapToViewInstalledList")
                  : onOpenSortDownload
                    ? t("settings.activeModels.tapToAddOrChangeModel")
                    : undefined
              }
            />
            <ActiveModelCard
              className="flex-1 min-w-[min(100%,260px)]"
              title={t("settings.activeModels.visionTitle")}
              modelName={
                cloudSortActive
                  ? cloudVisionDisplayName ?? (
                      <span className="text-muted">{t("settings.activeModels.visionCloudAutomatic")}</span>
                    )
                  : visionPrimary
              }
              preset={cloudSortActive ? undefined : visionPresetForCard}
              statusBadge={
                cloudSortActive
                  ? cloudVisionDisplayName
                    ? cloudStatusBadge
                    : localVisionBadge
                  : localVisionBadge
              }
              hideCustomUnknown={cloudSortActive}
              t={t}
              gbUnit={gbUnit}
              footerHint={
                cloudSortActive
                  ? cloudVisionDisplayName
                    ? t("settings.activeModels.footerVisionCloudNamed", { model: cloudVisionDisplayName })
                    : t("settings.activeModels.footerVisionCloudNoLocal")
                  : visionFooterHint
              }
            />
          </div>
          {onRefreshModels ? (
            <div className="flex justify-center sm:justify-start">
              <button
                type="button"
                onClick={() => void onRefreshModels()}
                disabled={refreshModelsLoading}
                className={`${SECONDARY_BTN_CLASS} px-3 py-2 text-sm disabled:opacity-50`}
              >
                {cloudSortActive
                  ? t("settings.models.refreshVisionList")
                  : t("settings.models.refreshList")}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
