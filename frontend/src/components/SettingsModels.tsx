import { useState, useMemo } from "react";
import type { UseModelsReturn } from "../hooks/useModels";
import type { AppSettings } from "../types/settings";
import {
  findPreset,
  formatPresetRamRange,
  normalizeModel,
  presetRamRangeTitle,
  type ModelPreset,
  type SpeedTier,
} from "../utils/modelCatalogue";
import {
  SECONDARY_BTN_CLASS,
  DANGER_INLINE_CLASS,
  SECTION_TITLE_CLASS,
  SECTION_CHEVRON_CLASS,
  MODAL_FOOTER_ROW_CLASS,
  INSTALLED_MODELS_PANELS_GRID_CLASS,
  INSTALLED_MODEL_ROW_GRID_CLASS,
  INSTALLED_MODEL_TABLE_INNER_CLASS,
} from "../utils/styles";
import { sortChatInstalledDisplayModels } from "../utils/sortChatInstalledModels";
import { firstInstalledVisionModel, isVisionCapableModelName } from "../utils/visionModels";
import ActiveModelSection from "./settings/ActiveModelSection";
import {
  SortChatInstalledModelsPanel,
  VisionInstalledModelsPanel,
} from "./settings/InstalledModelsSortVisionPanels";
import ModelDownloadBlocks from "./settings/ModelDownloadBlocks";
import ModalShell from "./ModalShell";
import SectionHeader from "./ui/SectionHeader";
import { formatInstallPhase } from "../utils/modelInstallPhase";
import { StatusToneBadge } from "./ui/StatusBadge";
import { useI18n } from "../i18n/I18nContext";
import { useCloudSortActive } from "../hooks/useCloudSortActive";
import type { EntitlementStatus } from "../api";

type SettingsModelsSection = "installed" | "download";

/** Welcome wizard splits the download UI into sort/chat vs vision; full Settings uses both. */
type SettingsModelsDownloadScope = "full" | "sortOnly" | "visionOnly";
type SettingsModelsInstalledScope = "full" | "visionOnly";

interface SettingsModelsProps {
  settings: AppSettings;
  modelHook: UseModelsReturn;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  collapsed: Set<string>;
  onToggleSection: (id: string) => void;
  /** When false, Active Model is rendered in Settings (above OCR). Default true. */
  showActiveModel?: boolean;
  /** Which blocks to render. Default: download first, then installed. Split when reordering Settings. */
  sections?: SettingsModelsSection[];
  /** When set, replaces the download section title (e.g. welcome sub-step). */
  downloadPanelTitle?: string;
  /** Show only the sort/chat or vision download block; default shows both. */
  downloadScope?: SettingsModelsDownloadScope;
  /** When the Active models block is above this section (no Download block), add top spacing. */
  spacingAfterActiveModel?: boolean;
  /** Full Installed Models list inline (default), or welcome wizard: lists open from Active model cards only. */
  installedModelsPresentation?: "inline" | "modalsFromActiveCards";
  /** Controlled: open the installed modal for the given role from a parent (e.g. clicking active model card). */
  externalInstalledModal?: "sort" | "vision" | null;
  onCloseExternalInstalledModal?: () => void;
  /** When false, defer Ollama storage API calls until the local backend is up. */
  storageQueriesEnabled?: boolean;
  entitlement?: EntitlementStatus | null;
  /** When cloud sort is active, hide local sort models from the installed list. */
  installedScope?: SettingsModelsInstalledScope;
}


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

const DEFAULT_SECTIONS: SettingsModelsSection[] = ["download", "installed"];

export default function SettingsModels({
  settings, modelHook, onSettingsPatch, collapsed, onToggleSection,
  showActiveModel = true,
  sections = DEFAULT_SECTIONS,
  downloadPanelTitle,
  downloadScope = "full",
  spacingAfterActiveModel = false,
  installedModelsPresentation = "inline",
  externalInstalledModal,
  onCloseExternalInstalledModal,
  storageQueriesEnabled = true,
  entitlement,
  installedScope = "full",
}: SettingsModelsProps) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive(entitlement);
  const visionOnlyInstalled = installedScope === "visionOnly";
  const sectionSet = new Set(sections);
  const hasInstalledSection = sectionSet.has("installed");
  const showInstalledBlock = hasInstalledSection && installedModelsPresentation === "inline";
  const useInstalledModals = hasInstalledSection && installedModelsPresentation === "modalsFromActiveCards";
  const [localInstalledModal, setLocalInstalledModal] = useState<null | "sort" | "vision">(null);
  const installedModal = externalInstalledModal !== undefined ? externalInstalledModal : localInstalledModal;
  const setInstalledModal = externalInstalledModal !== undefined
    ? (_role: "sort" | "vision" | null) => onCloseExternalInstalledModal?.()
    : setLocalInstalledModal;
  const showDownload = sectionSet.has("download");
  const downloadTitleText = downloadPanelTitle ?? t("settings.models.downloadTitle");
  const {
    models, loadingModels, installingModel, installingModelName, installProgress,
    installPhase,
    deletingModel, systemRamGb, cancelInstall, deleteModel, refreshModels,
  } = modelHook;

  const [confirmDeleteModel, setConfirmDeleteModel] = useState<string | null>(null);

  const downloadingLabel = installingModelName ?? t("settings.models.downloadingFallback");
  const downloadingPreset = findPreset(downloadingLabel);
  const installingNameRaw = installingModelName ?? "";
  const installingForVision =
    installingModel && Boolean(installingNameRaw) && isVisionCapableModelName(installingNameRaw);

  const installedModelRowGrid = INSTALLED_MODEL_ROW_GRID_CLASS;

  const ramVsSystemClass = (preset: ModelPreset | undefined) => {
    if (!preset || systemRamGb === null) return "text-muted";
    if (systemRamGb >= preset.recRamGb) return "text-success";
    if (systemRamGb >= preset.minRamGb) return "text-warning";
    return "text-error";
  };

  const renderActiveInstallProgress = (variant: "sort" | "vision") => {
    const roleLabel =
      variant === "sort" ? t("settings.models.installRoleSortChat") : t("settings.models.installRoleVision");
    return (
      <div className="mt-2 rounded-xl border border-accent-line overflow-hidden bg-accent-light/35">
        <div className="px-3 sm:px-4 border-b border-accent-line/50 py-2">
          <p className="text-2xs font-semibold uppercase tracking-wide text-accent">{roleLabel}</p>
        </div>
        <div className={`${installedModelRowGrid} py-2.5`}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate" title={downloadingLabel}>
              {downloadingLabel}
            </p>
            <p className="text-2xs text-accent font-semibold uppercase tracking-wide">{t("settings.models.downloading")}</p>
          </div>
          <span className="text-xs text-muted tabular-nums w-full text-right block whitespace-nowrap">
            {downloadingPreset ? `${downloadingPreset.sizeGb} GB` : "—"}
          </span>
          <span
            className={`text-xs font-medium tabular-nums w-full text-right block whitespace-nowrap ${ramVsSystemClass(downloadingPreset)}`}
            title={presetRamRangeTitle(downloadingPreset)}
          >
            {formatPresetRamRange(downloadingPreset)}
          </span>
          <span className="flex w-full min-w-0 justify-end">
            {downloadingPreset ? (
              <SpeedBadge speed={downloadingPreset.speed} t={t} />
            ) : (
              <span className="text-xs text-muted">—</span>
            )}
          </span>
          <div className="flex w-full justify-end">
            <button
              type="button"
              onClick={() => void cancelInstall()}
              className={DANGER_INLINE_CLASS}
              title={t("settings.models.cancelDownload")}
            >
              {t("settings.models.cancel")}
            </button>
          </div>
        </div>
        <div className="px-4 pb-3 space-y-1.5">
          <p className="text-2xs text-muted capitalize">
            {installPhase ? formatInstallPhase(installPhase) : t("settings.models.preparingDownload")}
          </p>
          <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
            {installProgress >= 0 ? (
              <div
                className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${installProgress}%` }}
              />
            ) : (
              <div className="h-full w-full rounded-full bg-accent opacity-70 motion-safe:animate-pulse" />
            )}
          </div>
          {installProgress >= 0 && (
            <p className="text-2xs font-bold text-accent tabular-nums text-right">{installProgress}%</p>
          )}
        </div>
      </div>
    );
  };

  const visionTrim = settings.visionModel.trim();
  const visionModelsInstalled = models.filter(isVisionCapableModelName);
  const autoVisionResolved = firstInstalledVisionModel(models);
  const autoVisionPreset = autoVisionResolved ? findPreset(autoVisionResolved) : undefined;
  /** Per-model rows below automatic — omit the first resolved install so it is not shown twice. */
  const visionModelsExtra = useMemo(
    () =>
      visionModelsInstalled.filter(
        (m) =>
          !autoVisionResolved || normalizeModel(m) !== normalizeModel(autoVisionResolved)
      ),
    [visionModelsInstalled, autoVisionResolved]
  );

  /** Includes settings.model when Ollama’s list omits the active sort model (fixes list vs Active cards). */
  const sortTableModels = useMemo(
    () => sortChatInstalledDisplayModels(models, settings.model),
    [models, settings.model]
  );

  const sortModelTrim = settings.model.trim();
  const sortChatEmptyBanner = useMemo(() => {
    if (cloudSortActive && sortModelTrim) return null;
    if (sortTableModels.length > 0) return null;
    if (installingModel && !installingForVision) return "downloading" as const;
    if (models.length === 0) return "noOllamaList" as const;
    if (sortModelTrim && isVisionCapableModelName(sortModelTrim)) return "sortPickIsVision" as const;
    return "onlyVisionOnDisk" as const;
  }, [
    sortTableModels.length,
    installingModel,
    installingForVision,
    models.length,
    sortModelTrim,
    cloudSortActive,
  ]);

  const hasVisionInstalled = models.some(isVisionCapableModelName);

  /** Hide the whole Installed block when there is nothing to show (no empty warning card). */
  const showInstalledModelsUi =
    showInstalledBlock &&
    (visionOnlyInstalled
      ? loadingModels ||
        hasVisionInstalled ||
        Boolean(installingForVision) ||
        Boolean(settings.visionModel.trim())
      : loadingModels ||
        models.length > 0 ||
        !!installingModel ||
        Boolean(sortModelTrim) ||
        Boolean(settings.visionModel.trim()));

  /** Spacing when Download or Active models block is above Installed. */
  const hasBlockAboveInstalled = showDownload || spacingAfterActiveModel;
  /** Spacing above Active model when Installed (and optionally Download) is shown. */
  const hasBlockAboveActive = showDownload || showInstalledModelsUi || spacingAfterActiveModel;

  const sortInstallProgressNode =
    installingModel && !installingForVision ? renderActiveInstallProgress("sort") : null;
  const visionInstallProgressNode =
    installingModel && installingForVision ? renderActiveInstallProgress("vision") : null;

  const installedPanelCommon = {
    t,
    settings,
    onSettingsPatch,
    models,
    installedModelRowGrid,
    ramVsSystemClass,
    deletingModel,
    confirmDeleteModel,
    setConfirmDeleteModel,
    deleteModel,
  };

  const { settings: _installedPanelSettings, ...installedVisionSpread } = installedPanelCommon;
  void _installedPanelSettings;

  return (
    <>
      {/* Download New Model */}
      {showDownload && (
      <section
        id="download-model"
        className="scroll-mt-24"
      >
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => onToggleSection("download-model")}
            className="flex items-center gap-2 group flex-1 min-w-0"
          >
            <h2 className={SECTION_TITLE_CLASS}>{downloadTitleText}</h2>
            <svg
              className={`${SECTION_CHEVRON_CLASS} ${collapsed.has("download-model") ? "-rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
        {!collapsed.has("download-model") && (
          <ModelDownloadBlocks
            settings={settings}
            modelHook={modelHook}
            onSettingsPatch={onSettingsPatch}
            downloadScope={downloadScope}
            storageQueriesEnabled={storageQueriesEnabled}
            entitlement={entitlement}
          />
        )}
      </section>
      )}

      {showActiveModel && useInstalledModals && (
        <div className={showDownload || spacingAfterActiveModel ? "mt-8" : undefined}>
          <ActiveModelSection
            settings={settings}
            installedModels={modelHook.models}
            collapsed={collapsed}
            onToggleSection={onToggleSection}
            onRefreshModels={() => void refreshModels()}
            refreshModelsLoading={loadingModels}
            onOpenSortInstalledBrowse={() => setInstalledModal("sort")}
            entitlement={entitlement}
          />
        </div>
      )}

      {/* Installed Models */}
      {showInstalledModelsUi && (
      <section
        data-tour="settings-models-installed"
        className={hasBlockAboveInstalled ? "mt-8 scroll-mt-24" : "scroll-mt-24"}
      >
        <SectionHeader
          id="installed-models"
          label={t("settings.models.installedTitle")}
          collapsed={collapsed.has("installed-models")}
          onToggle={onToggleSection}
        />
        {!collapsed.has("installed-models") && (loadingModels ? (
          <div
            className="rounded-xl border border-border min-w-0 overflow-hidden"
            aria-busy="true"
            aria-label={t("settings.models.loadingModels")}
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <div className={INSTALLED_MODEL_TABLE_INNER_CLASS}>
                <div className={`${installedModelRowGrid} py-2 bg-bg-secondary border-b border-border`}>
                  <span className="h-2.5 w-24 rounded bg-border animate-pulse" />
                  <span className="h-2.5 w-10 rounded bg-border animate-pulse justify-self-end" />
                  <span className="h-2.5 w-12 rounded bg-border animate-pulse justify-self-end" />
                  <span className="h-2.5 w-12 rounded bg-border animate-pulse justify-self-end" />
                  <span className="h-2.5 w-8 rounded bg-border animate-pulse justify-self-end" />
                </div>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`${installedModelRowGrid} py-2.5 border-b border-border last:border-b-0 bg-bg-card`}
                  >
                    <span className="h-3.5 max-w-[min(100%,14rem)] rounded-md bg-border/70 animate-pulse" />
                    <span className="h-3 w-10 rounded bg-border/70 animate-pulse justify-self-end" />
                    <span className="h-3 w-12 rounded bg-border/70 animate-pulse justify-self-end" />
                    <span className="h-5 w-14 rounded-full bg-border/70 animate-pulse justify-self-end" />
                    <span className="h-6 w-6 rounded bg-border/70 animate-pulse justify-self-end opacity-0" aria-hidden />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={INSTALLED_MODELS_PANELS_GRID_CLASS}>
            {!visionOnlyInstalled ? (
            <SortChatInstalledModelsPanel
              {...installedPanelCommon}
              sortTableModels={sortTableModels}
              sortChatEmptyBanner={sortChatEmptyBanner}
              installingModel={installingModel}
              installingForVision={installingForVision}
              sortInstallProgress={sortInstallProgressNode}
            />
            ) : null}
            <VisionInstalledModelsPanel
              {...installedVisionSpread}
              visionTrim={visionTrim}
              visionModelsInstalled={visionModelsInstalled}
              visionModelsExtra={visionModelsExtra}
              autoVisionResolved={autoVisionResolved}
              autoVisionPreset={autoVisionPreset}
              installingModel={installingModel}
              installingForVision={installingForVision}
              visionInstallProgress={visionInstallProgressNode}
            />
          </div>
        ))}
      </section>
      )}
      {showActiveModel && showInstalledBlock && (
        <div className={hasBlockAboveActive ? "mt-8" : undefined}>
          <ActiveModelSection
            settings={settings}
            installedModels={modelHook.models}
            collapsed={collapsed}
            onToggleSection={onToggleSection}
            onRefreshModels={() => void refreshModels()}
            refreshModelsLoading={loadingModels}
            onOpenSortInstalledBrowse={() => setLocalInstalledModal("sort")}
            entitlement={entitlement}
          />
        </div>
      )}

      {installedModal ? (
        <ModalShell
          title={
            installedModal === "sort"
              ? t("settings.models.sortChatBlock")
              : t("settings.models.visionBlock")
          }
          onClose={() => setInstalledModal(null)}
          maxWidthClass="max-w-2xl"
          footer={
            <div className={`${MODAL_FOOTER_ROW_CLASS} justify-end`}>
              <button
                type="button"
                onClick={() => void refreshModels()}
                disabled={loadingModels}
                className={`${SECONDARY_BTN_CLASS} px-4 py-2 text-sm disabled:opacity-50`}
              >
                {t("settings.models.refreshList")}
              </button>
            </div>
          }
        >
          {loadingModels ? (
            <p className="px-1 py-4 text-sm text-muted">{t("settings.models.loadingModels")}</p>
          ) : installedModal === "sort" ? (
            <SortChatInstalledModelsPanel
              {...installedPanelCommon}
              sortTableModels={sortTableModels}
              sortChatEmptyBanner={sortChatEmptyBanner}
              installingModel={installingModel}
              installingForVision={installingForVision}
              sortInstallProgress={sortInstallProgressNode}
            />
          ) : (
            <VisionInstalledModelsPanel
              {...installedVisionSpread}
              visionTrim={visionTrim}
              visionModelsInstalled={visionModelsInstalled}
              visionModelsExtra={visionModelsExtra}
              autoVisionResolved={autoVisionResolved}
              autoVisionPreset={autoVisionPreset}
              installingModel={installingModel}
              installingForVision={installingForVision}
              visionInstallProgress={visionInstallProgressNode}
            />
          )}
        </ModalShell>
      ) : null}

    </>
  );
}
