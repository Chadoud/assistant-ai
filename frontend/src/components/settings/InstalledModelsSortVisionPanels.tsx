import type { ReactNode } from "react";
import type { AppSettings } from "../../types/settings";
import {
  findPreset,
  formatPresetRamRange,
  normalizeModel,
  presetRamRangeTitle,
  type ModelPreset,
  type SpeedTier,
} from "../../utils/modelCatalogue";
import {
  DANGER_INLINE_CLASS,
  GHOST_ICON_BTN_CLASS,
  INSTALLED_MODEL_TABLE_INNER_CLASS,
  SECONDARY_BTN_CLASS,
  SECTION_LABEL_CLASS,
} from "../../utils/styles";
import { isModelReportedByOllama } from "../../utils/sortChatInstalledModels";
import HoverHelpCard from "../ui/HoverHelpCard";
import { StatusToneBadge } from "../ui/StatusBadge";

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

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function InstalledModelTableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border min-w-0 overflow-hidden">
      <div className="overflow-x-auto overscroll-x-contain">
        <div className={INSTALLED_MODEL_TABLE_INNER_CLASS}>{children}</div>
      </div>
    </div>
  );
}

type InstalledPanelsCommon = {
  t: TFn;
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  models: string[];
  installedModelRowGrid: string;
  ramVsSystemClass: (preset: ModelPreset | undefined) => string;
  deletingModel: string | null;
  confirmDeleteModel: string | null;
  setConfirmDeleteModel: (m: string | null) => void;
  deleteModel: (name: string) => Promise<void>;
};

type SortPanelProps = InstalledPanelsCommon & {
  sortTableModels: string[];
  sortChatEmptyBanner:
    | "downloading"
    | "noOllamaList"
    | "sortPickIsVision"
    | "onlyVisionOnDisk"
    | null;
  installingModel: boolean;
  installingForVision: boolean;
  sortInstallProgress: ReactNode;
};

/**
 * Sort & chat installed-model table (shared by Settings and welcome modal).
 */
export function SortChatInstalledModelsPanel({
  t,
  settings,
  onSettingsPatch,
  models,
  installedModelRowGrid,
  ramVsSystemClass,
  sortTableModels,
  sortChatEmptyBanner,
  installingModel,
  installingForVision,
  deletingModel,
  confirmDeleteModel,
  setConfirmDeleteModel,
  deleteModel,
  sortInstallProgress,
}: SortPanelProps) {
  return (
    <div className="space-y-2">
      <HoverHelpCard hint={t("settings.models.sortChatHelp")}>
        <p className={SECTION_LABEL_CLASS}>{t("settings.models.sortChatBlock")}</p>
        <p className="text-2xs text-muted mt-1 max-w-xl">{t("settings.models.sortChatSubtitle")}</p>
      </HoverHelpCard>
      {sortTableModels.length === 0 ? (
        sortChatEmptyBanner === "downloading" ? (
          <div className="rounded-xl border border-accent-line bg-bg-card px-4 py-3 text-sm text-text-primary leading-relaxed">
            {t("settings.models.downloadingFirstTextModel")}
          </div>
        ) : sortChatEmptyBanner === "noOllamaList" ? (
          <div className="rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-primary leading-relaxed">
            {t("settings.models.noOllamaModelsReported")}
          </div>
        ) : sortChatEmptyBanner === "sortPickIsVision" ? (
          <div className="rounded-xl border border-warning-line bg-warning-soft/40 px-4 py-3 text-sm text-warning leading-relaxed">
            {t("settings.models.sortChatPickIsVisionModel")}
          </div>
        ) : (
          <div className="rounded-xl border border-warning-line bg-warning-soft/40 px-4 py-3 text-sm text-warning leading-relaxed">
            {t("settings.models.noTextModels")}
          </div>
        )
      ) : (
        <InstalledModelTableFrame>
          <div className={`${installedModelRowGrid} py-2 bg-bg-secondary border-b border-border`}>
            <span className="text-2xs font-bold uppercase tracking-widest text-muted min-w-0">{t("settings.models.colModel")}</span>
            <span
              className="text-2xs font-bold uppercase tracking-widest text-muted w-full text-right block"
              title={t("settings.models.colSizeTitle")}
            >
              {t("settings.models.colSize")}
            </span>
            <span
              className="text-2xs font-bold uppercase tracking-widest text-muted w-full text-right block"
              title={t("settings.models.colRamTitle")}
            >
              {t("settings.models.colRam")}
            </span>
            <span className="text-2xs font-bold uppercase tracking-widest text-muted w-full text-right block">
              {t("settings.models.colSpeed")}
            </span>
            <span className="block w-full" aria-hidden />
          </div>
          {sortTableModels.map((m) => {
            const preset = findPreset(m);
            const isSortModel =
              m === settings.model || normalizeModel(m) === normalizeModel(settings.model);
            const isDeleting = deletingModel === m;
            const isConfirming = confirmDeleteModel === m;
            const listedByOllama = isModelReportedByOllama(models, m);
            return (
              <div
                key={`sort-${m}`}
                className={`border-b border-border last:border-b-0 transition-colors
                  ${isSortModel ? "bg-accent-light" : "bg-bg-card hover:bg-hover-overlay"}`}
              >
                <div className={`${installedModelRowGrid} py-2.5`}>
                  <button
                    type="button"
                    onClick={() => !isSortModel && onSettingsPatch({ model: m })}
                    className={`min-w-0 text-left text-sm font-medium transition-colors flex flex-col items-start gap-0.5
                      ${isSortModel ? "text-accent cursor-default" : "text-text-primary hover:text-accent"}`}
                    title={
                      isSortModel ? t("settings.models.currentSort") : t("settings.models.useForSort", { name: m })
                    }
                  >
                    <span className="min-w-0 w-full text-left break-words line-clamp-2">{m}</span>
                    {!listedByOllama ? (
                      <span className="text-2xs text-muted font-normal">{t("settings.models.rowNotInOllamaList")}</span>
                    ) : null}
                  </button>
                  <span className="text-xs text-muted tabular-nums w-full text-right block whitespace-nowrap">
                    {preset ? `${preset.sizeGb} GB` : "—"}
                  </span>
                  <span
                    className={`text-xs font-medium tabular-nums w-full text-right block whitespace-nowrap ${ramVsSystemClass(preset)}`}
                    title={presetRamRangeTitle(preset)}
                  >
                    {formatPresetRamRange(preset)}
                  </span>
                  <span className="flex w-full min-w-0 justify-end">
                    {preset ? <SpeedBadge speed={preset.speed} t={t} /> : <span className="text-xs text-muted">—</span>}
                  </span>
                  <div className="flex w-full justify-end">
                    {isSortModel ? (
                      <StatusToneBadge tone="accent">{t("settings.models.badgeSortChat")}</StatusToneBadge>
                    ) : (
                      <button
                        type="button"
                        disabled={isDeleting || !!deletingModel || !listedByOllama}
                        onClick={() => (isConfirming ? setConfirmDeleteModel(null) : setConfirmDeleteModel(m))}
                        className={`${GHOST_ICON_BTN_CLASS} hover:text-error hover:bg-error-soft disabled:opacity-40 disabled:pointer-events-none`}
                        title={
                          !listedByOllama
                            ? t("settings.models.deleteUnavailableNotInList")
                            : t("settings.models.deleteModel")
                        }
                      >
                        {isDeleting ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m19 7-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                {isConfirming && (
                  <div className="flex items-center justify-between gap-2 px-4 pb-3">
                    <p className="text-xs text-error">{t("settings.models.deleteConfirm", { name: m })}</p>
                    <div className="flex gap-1.5 shrink-0">
                      <button type="button" onClick={() => setConfirmDeleteModel(null)} className={SECONDARY_BTN_CLASS}>
                        {t("settings.models.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setConfirmDeleteModel(null);
                          await deleteModel(m);
                        }}
                        className={DANGER_INLINE_CLASS}
                      >
                        {t("settings.models.delete")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </InstalledModelTableFrame>
      )}
      {installingModel && !installingForVision ? sortInstallProgress : null}
    </div>
  );
}

type VisionInstalledModelsPanelProps = Omit<InstalledPanelsCommon, "settings" | "onSettingsPatch"> & {
  visionTrim: string;
  visionModelsInstalled: string[];
  visionModelsExtra: string[];
  autoVisionResolved: string | null | undefined;
  autoVisionPreset: ReturnType<typeof findPreset> | undefined;
  installingModel: boolean;
  installingForVision: boolean;
  visionInstallProgress: ReactNode;
};

/**
 * Vision installed-model table (shared by Settings and welcome modal).
 */
export function VisionInstalledModelsPanel({
  t,
  models,
  installedModelRowGrid,
  ramVsSystemClass,
  deletingModel,
  confirmDeleteModel,
  setConfirmDeleteModel,
  deleteModel,
  visionTrim,
  visionModelsInstalled,
  visionModelsExtra,
  autoVisionResolved,
  autoVisionPreset,
  installingModel,
  installingForVision,
  visionInstallProgress,
}: VisionInstalledModelsPanelProps) {
  return (
    <div id="settings-vision-models" className="space-y-2 scroll-mt-28">
      <HoverHelpCard hint={t("settings.models.visionHelp")}>
        <p className={SECTION_LABEL_CLASS}>{t("settings.models.visionBlock")}</p>
        <p className="text-2xs text-muted mt-1 max-w-xl">{t("settings.models.visionSubtitle")}</p>
      </HoverHelpCard>
      <InstalledModelTableFrame>
        <div className={`${installedModelRowGrid} py-2 bg-bg-secondary border-b border-border`}>
          <span className="text-2xs font-bold uppercase tracking-widest text-muted min-w-0">{t("settings.models.colModel")}</span>
          <span
            className="text-2xs font-bold uppercase tracking-widest text-muted w-full text-right block"
            title={t("settings.models.colSizeTitle")}
          >
            {t("settings.models.colSize")}
          </span>
          <span
            className="text-2xs font-bold uppercase tracking-widest text-muted w-full text-right block"
            title={t("settings.models.colRamTitle")}
          >
            {t("settings.models.colRam")}
          </span>
          <span className="text-2xs font-bold uppercase tracking-widest text-muted w-full text-right block">
            {t("settings.models.colSpeed")}
          </span>
          <span className="block w-full" aria-hidden />
        </div>
        <div
          className={`border-b border-border transition-colors ${
            !visionTrim ? "bg-accent-light" : "bg-bg-card"
          }`}
        >
          <div className={`${installedModelRowGrid} py-2.5`}>
            <div
              className={`min-w-0 text-sm font-medium ${
                !visionTrim ? "text-accent" : "text-text-primary"
              }`}
              title={
                autoVisionResolved
                  ? t("settings.models.autoActive", { name: autoVisionResolved })
                  : t("settings.models.autoNone")
              }
            >
              <span className="block min-w-0 break-words line-clamp-2">
                {autoVisionResolved ?? t("settings.models.noVisionRow")}
              </span>
            </div>
            <span className="text-xs text-muted tabular-nums w-full text-right block whitespace-nowrap">
              {autoVisionPreset ? `${autoVisionPreset.sizeGb} GB` : "—"}
            </span>
            <span
              className={`text-xs font-medium tabular-nums w-full text-right block whitespace-nowrap ${ramVsSystemClass(autoVisionPreset)}`}
              title={presetRamRangeTitle(autoVisionPreset)}
            >
              {formatPresetRamRange(autoVisionPreset)}
            </span>
            <span className="flex w-full min-w-0 justify-end">
              {autoVisionPreset ? (
                <SpeedBadge speed={autoVisionPreset.speed} t={t} />
              ) : (
                <span className="text-xs text-muted w-full text-right block">—</span>
              )}
            </span>
            <div className="flex w-full justify-end">
              <StatusToneBadge tone="accent">{t("settings.models.badgeAuto")}</StatusToneBadge>
            </div>
          </div>
        </div>
        {visionModelsInstalled.length === 0 ? (
          <div className="px-4 py-3 bg-bg-card border-t border-border-soft">
            <p className="text-xs text-muted">
              {installingModel && installingForVision
                ? t("settings.models.downloadingFirstVisionModel")
                : t("settings.models.noVisionDownloadHint")}
            </p>
          </div>
        ) : (
          visionModelsExtra.map((m) => {
            const preset = findPreset(m);
            const isDeleting = deletingModel === m;
            const isConfirming = confirmDeleteModel === m;
            const listedByOllama = isModelReportedByOllama(models, m);
            return (
              <div
                key={`vision-${m}`}
                className="border-b border-border last:border-b-0 bg-bg-card"
              >
                <div className={`${installedModelRowGrid} py-2.5`}>
                  <div className="min-w-0 text-sm font-medium text-text-primary">
                    <span className="block min-w-0 break-words line-clamp-2">{m}</span>
                    {!listedByOllama ? (
                      <span className="text-2xs text-muted font-normal block mt-0.5">
                        {t("settings.models.rowNotInOllamaList")}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted tabular-nums w-full text-right block whitespace-nowrap">
                    {preset ? `${preset.sizeGb} GB` : "—"}
                  </span>
                  <span
                    className={`text-xs font-medium tabular-nums w-full text-right block whitespace-nowrap ${ramVsSystemClass(preset)}`}
                    title={presetRamRangeTitle(preset)}
                  >
                    {formatPresetRamRange(preset)}
                  </span>
                  <span className="flex w-full min-w-0 justify-end">
                    {preset ? <SpeedBadge speed={preset.speed} t={t} /> : <span className="text-xs text-muted">—</span>}
                  </span>
                  <div className="flex w-full justify-end">
                    <button
                      type="button"
                      disabled={isDeleting || !!deletingModel || !listedByOllama}
                      onClick={() => (isConfirming ? setConfirmDeleteModel(null) : setConfirmDeleteModel(m))}
                      className={`${GHOST_ICON_BTN_CLASS} hover:text-error hover:bg-error-soft disabled:opacity-40 disabled:pointer-events-none`}
                      title={
                        !listedByOllama
                          ? t("settings.models.deleteUnavailableNotInList")
                          : t("settings.models.deleteModel")
                      }
                    >
                        {isDeleting ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m19 7-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                      </button>
                  </div>
                </div>
                {isConfirming && (
                  <div className="flex items-center justify-between gap-2 px-4 pb-3">
                    <p className="text-xs text-error">{t("settings.models.deleteConfirm", { name: m })}</p>
                    <div className="flex gap-1.5 shrink-0">
                      <button type="button" onClick={() => setConfirmDeleteModel(null)} className={SECONDARY_BTN_CLASS}>
                        {t("settings.models.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setConfirmDeleteModel(null);
                          await deleteModel(m);
                        }}
                        className={DANGER_INLINE_CLASS}
                      >
                        {t("settings.models.delete")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </InstalledModelTableFrame>
      {installingModel && installingForVision ? visionInstallProgress : null}
    </div>
  );
}
