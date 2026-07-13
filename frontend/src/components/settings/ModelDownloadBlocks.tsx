import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import type { UseModelsReturn } from "../../hooks/useModels";
import type { AppSettings } from "../../types/settings";
import {
  MODEL_PRESETS,
  isSep,
  normalizeModel,
  type ModelEntry,
  type ModelPreset,
  type SpeedTier,
} from "../../utils/modelCatalogue";
import {
  buildModelEntriesForSortChat,
  buildModelEntriesForVision,
  countPresetRows,
} from "../../utils/modelDownloadEntries";
import {
  SECONDARY_BTN_CLASS,
  TABLE_CELL_LABEL,
  TABLE_CELL_NUM,
  TABLE_CELL_MUTED_DASH,
} from "../../utils/styles";
import { isVisionCapableModelName } from "../../utils/visionModels";
import { effectiveModelsForDownloadUi } from "../../utils/sortChatInstalledModels";
import SelectDropdown, { SELECT_DROPDOWN_PANEL_CLASS } from "../ui/SelectDropdown";
import { StatusToneBadge } from "../ui/StatusBadge";
import { useI18n } from "../../i18n/I18nContext";
import { hasElectronBridge } from "../../utils/platform";
import { useOllamaStorage } from "../../hooks/useOllamaStorage";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";
import type { EntitlementStatus } from "../../api";
import {
  filterPartialsForSortChat,
  filterPartialsForVision,
  sumPartialBytes,
} from "../../utils/ollamaPartialsScope";
import OllamaPartialsEmbed from "./OllamaPartialsEmbed";

export type ModelDownloadScope = "full" | "sortOnly" | "visionOnly";

const SORT_DOWNLOAD_ENTRIES = buildModelEntriesForSortChat();
const VISION_DOWNLOAD_ENTRIES = buildModelEntriesForVision();
const SORT_DOWNLOAD_PRESET_COUNT = countPresetRows(SORT_DOWNLOAD_ENTRIES);
const VISION_DOWNLOAD_PRESET_COUNT = countPresetRows(VISION_DOWNLOAD_ENTRIES);

function firstPresetName(entries: ModelEntry[]): string {
  for (const e of entries) {
    if (!isSep(e)) return (e as ModelPreset).name;
  }
  return "qwen2.5:7b";
}

/**
 * Seed the "model to install" picker with the best initial selection:
 * 1. The user's current active model, if it appears in the preset catalog.
 * 2. The first installed model that appears in the preset catalog.
 * 3. The fallback (first catalog entry).
 *
 * This ensures the dropdown opens on something already on disk rather than
 * always on the first catalog entry when the active model is a Gemini slug
 * or otherwise not in the Ollama catalog.
 */
function initialModelSelection(
  entries: ModelEntry[],
  currentModel: string | undefined,
  installedModels: string[],
  fallback: string
): string {
  const findInEntries = (name: string): string | null => {
    const norm = normalizeModel(name);
    for (const e of entries) {
      if (!isSep(e)) {
        const p = e as ModelPreset;
        if (p.name === name || normalizeModel(p.name) === norm) return p.name;
      }
    }
    return null;
  };

  if (currentModel) {
    const match = findInEntries(currentModel);
    if (match) return match;
  }

  for (const installed of installedModels) {
    const match = findInEntries(installed);
    if (match) return match;
  }

  return fallback;
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

interface ModelDownloadBlocksProps {
  settings: AppSettings;
  modelHook: UseModelsReturn;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  downloadScope: ModelDownloadScope;
  /** When false, omits “Refresh models list” (e.g. modals use a single refresh under Active models). Default true. */
  showRefreshButtons?: boolean;
  /** When false, skips Ollama storage scans until the local API is online. */
  storageQueriesEnabled?: boolean;
  entitlement?: EntitlementStatus | null;
}

export default function ModelDownloadBlocks({
  settings,
  modelHook,
  onSettingsPatch,
  downloadScope,
  showRefreshButtons = true,
  storageQueriesEnabled = true,
  entitlement,
}: ModelDownloadBlocksProps) {
  const { t } = useI18n();
  const { cloudSortActive, loading: cloudSortLoading } = useCloudSortActive(entitlement);
  /** Device + delta need host RAM from Electron; browsers have nothing comparable to show. */
  const showMachineComparisonColumns = hasElectronBridge();
  const showSortDownloadBlock = downloadScope === "full" || downloadScope === "sortOnly";
  const showVisionDownloadBlock = downloadScope === "full" || downloadScope === "visionOnly";
  const {
    models, loadingModels, installingModel, installQueueCount,
    installMessage, setInstallMessage,
    systemRamGb, refreshModels, installModel,
  } = modelHook;

  const effectiveModels = useMemo(
    () =>
      effectiveModelsForDownloadUi(models, settings.model, settings.visionModel),
    [models, settings.model, settings.visionModel]
  );

  const ollamaStorage = useOllamaStorage({ enabled: storageQueriesEnabled });
  const {
    data: storageData,
    loading: partialLoading,
    error: partialError,
    refresh: refreshPartials,
    deleteGroup: deletePartialGroup,
    deletingId: partialDeletingId,
    prune: prunePartials,
    pruning: partialPruning,
    setError: setPartialError,
  } = ollamaStorage;
  const allPartialRows = storageData?.partials ?? [];
  const sortPartialRows = filterPartialsForSortChat(allPartialRows);
  const visionPartialRows = filterPartialsForVision(allPartialRows);
  const sortPartialBytes = sumPartialBytes(sortPartialRows);
  const visionPartialBytes = sumPartialBytes(visionPartialRows);

  const showSortPartialEmbed =
    showSortDownloadBlock &&
    (sortPartialRows.length > 0 ||
      partialError !== null ||
      partialLoading);
  const showVisionPartialEmbed =
    showVisionDownloadBlock &&
    (visionPartialRows.length > 0 ||
      (partialError !== null && downloadScope === "visionOnly") ||
      (partialLoading && downloadScope === "visionOnly"));

  const sortPartialHomeFooter =
    Boolean(storageData?.ollama_home) &&
    showSortPartialEmbed &&
    (downloadScope === "sortOnly" || downloadScope === "full");
  const visionPartialHomeFooter =
    Boolean(storageData?.ollama_home) &&
    showVisionPartialEmbed &&
    (downloadScope === "visionOnly" || (downloadScope === "full" && !sortPartialHomeFooter));

    const [modelToInstall, setModelToInstall] = useState(() =>
    initialModelSelection(SORT_DOWNLOAD_ENTRIES, settings.model, models, firstPresetName(SORT_DOWNLOAD_ENTRIES))
  );
  const [visionModelToInstall, setVisionModelToInstall] = useState(() =>
    VISION_DOWNLOAD_PRESET_COUNT > 0
      ? initialModelSelection(VISION_DOWNLOAD_ENTRIES, settings.visionModel, models, firstPresetName(VISION_DOWNLOAD_ENTRIES))
      : "llava:7b"
  );

  // Models load async — once the list arrives, correct the selection to an
  // installed preset if the current choice is not yet on disk.
  useEffect(() => {
    if (effectiveModels.length === 0) return;
    setModelToInstall((current) => {
      if (effectiveModels.some((m) => m === current || normalizeModel(m) === normalizeModel(current))) {
        return current;
      }
      for (const e of SORT_DOWNLOAD_ENTRIES) {
        if (!isSep(e)) {
          const p = e as ModelPreset;
          if (effectiveModels.some((m) => m === p.name || normalizeModel(m) === normalizeModel(p.name))) {
            return p.name;
          }
        }
      }
      return current;
    });
    if (VISION_DOWNLOAD_PRESET_COUNT > 0) {
      setVisionModelToInstall((current) => {
        if (effectiveModels.some((m) => m === current || normalizeModel(m) === normalizeModel(current))) {
          return current;
        }
        for (const e of VISION_DOWNLOAD_ENTRIES) {
          if (!isSep(e)) {
            const p = e as ModelPreset;
            if (effectiveModels.some((m) => m === p.name || normalizeModel(m) === normalizeModel(p.name))) {
              return p.name;
            }
          }
        }
        return current;
      });
    }
  // Only correct once when the list first loads — not on every user pick.
   
  }, [effectiveModels]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [sortModelDropdownOpen, setSortModelDropdownOpen] = useState(false);
  const [visionModelDropdownOpen, setVisionModelDropdownOpen] = useState(false);
  const [sortDropdownFocusedIndex, setSortDropdownFocusedIndex] = useState(-1);
  const [visionDropdownFocusedIndex, setVisionDropdownFocusedIndex] = useState(-1);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const visionTriggerRef = useRef<HTMLButtonElement>(null);
  const sortRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const visionRowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const openSortDropdown = useCallback(() => {
    setSortModelDropdownOpen(true);
    setSortDropdownFocusedIndex(0);
    requestAnimationFrame(() => sortRowRefs.current[0]?.focus());
  }, []);

  const closeSortDropdown = useCallback(() => {
    setSortModelDropdownOpen(false);
    setSortDropdownFocusedIndex(-1);
    sortTriggerRef.current?.focus();
  }, []);

  const openVisionDropdown = useCallback(() => {
    setVisionModelDropdownOpen(true);
    setVisionDropdownFocusedIndex(0);
    requestAnimationFrame(() => visionRowRefs.current[0]?.focus());
  }, []);

  const closeVisionDropdown = useCallback(() => {
    setVisionModelDropdownOpen(false);
    setVisionDropdownFocusedIndex(-1);
    visionTriggerRef.current?.focus();
  }, []);

  const selectSortPreset = useCallback(
    (name: string) => {
      setModelToInstall(name);
      closeSortDropdown();
    },
    [closeSortDropdown]
  );

  const selectVisionPreset = useCallback(
    (name: string) => {
      setVisionModelToInstall(name);
      closeVisionDropdown();
    },
    [closeVisionDropdown]
  );

  const handleInstallSortModel = async () => {
    const name = modelToInstall;
    setDownloadingModel(name);
    await installModel(name, () => onSettingsPatch({ model: name }));
    setDownloadingModel(null);
  };

  const handleInstallVisionModel = async () => {
    const name = visionModelToInstall;
    setDownloadingModel(name);
    await installModel(name, () => onSettingsPatch({ visionModel: name }));
    setDownloadingModel(null);
  };

  const recommendSortModel = () => {
    if (!systemRamGb) return;
    const textOnly = MODEL_PRESETS.filter((m) => !isVisionCapableModelName(m.name));
    const byCapacity = [...textOnly]
      .filter((m) => systemRamGb >= m.minRamGb)
      .sort((a, b) => b.recRamGb - a.recRamGb);
    const fallback = [...textOnly].sort((a, b) => a.minRamGb - b.minRamGb)[0];
    const best = byCapacity[0] ?? fallback;
    if (!best) return;
    setModelToInstall(best.name);
    const isInstalled = effectiveModels.some(
      (m) => m === best.name || normalizeModel(m) === normalizeModel(best.name)
    );
    if (isInstalled) onSettingsPatch({ model: best.name });
  };

  const recommendVisionModel = () => {
    if (!systemRamGb) return;
    const visionOnly = MODEL_PRESETS.filter((m) => isVisionCapableModelName(m.name));
    const byCapacity = [...visionOnly]
      .filter((m) => systemRamGb >= m.minRamGb)
      .sort((a, b) => b.recRamGb - a.recRamGb);
    const fallback = [...visionOnly].sort((a, b) => a.minRamGb - b.minRamGb)[0];
    const best = byCapacity[0] ?? fallback;
    if (!best) return;
    setVisionModelToInstall(best.name);
    const isInstalled = effectiveModels.some(
      (m) => m === best.name || normalizeModel(m) === normalizeModel(best.name)
    );
    if (isInstalled) onSettingsPatch({ visionModel: best.name });
  };

  const diff = (needed: number, device: number | null) => {
    if (device === null) return null;
    return Math.round((device - needed) * 10) / 10;
  };

  const isPresetInstalled = useCallback(
    (name: string) =>
      effectiveModels.some((m) => m === name || normalizeModel(m) === normalizeModel(name)),
    [effectiveModels]
  );

  const isModalScope = downloadScope !== "full";
  const blockStackClass = isModalScope ? "flex flex-col gap-2.5" : "space-y-3";
  const rootStackClass = isModalScope ? "space-y-5" : "space-y-8";
  const resourceCardClass = isModalScope
    ? "rounded-lg border border-border bg-bg-secondary p-2.5 space-y-2 text-xs"
    : "rounded-lg border border-border bg-bg-secondary p-3 space-y-3 text-xs";

  if (!cloudSortLoading && cloudSortActive) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4 text-sm text-text-secondary leading-relaxed">
        {t("remoteLlm.downloadDisabled")}
      </div>
    );
  }

  return (
    <div className={rootStackClass}>
      {!loadingModels && models.length === 0 && (showSortDownloadBlock || showVisionDownloadBlock) ? (
        <p className="text-2xs text-warning leading-snug">{t("settings.models.ollamaListEmptyHint")}</p>
      ) : null}
                {/* Sort & chat — text models only */}
                {showSortDownloadBlock ? (
                <div className={blockStackClass} data-tour="settings-models-download-chat">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                    <h3 className="m-0 text-sm font-semibold leading-snug text-text-primary">
                      {t("settings.models.downloadSectionText")}
                    </h3>
                    <button
                      type="button"
                      onClick={recommendSortModel}
                      disabled={!systemRamGb}
                      className={`${SECONDARY_BTN_CLASS} disabled:opacity-40 shrink-0 self-center text-xs`}
                      title={!systemRamGb ? t("settings.models.ramUnavailable") : t("settings.models.recommendSortTitle")}
                    >
                      {t("settings.models.recommendMachine")}
                    </button>
                  </div>
                  <SelectDropdown
                    open={sortModelDropdownOpen}
                    onOpenChange={(o) => {
                      if (o) openSortDropdown();
                      else closeSortDropdown();
                    }}
                    triggerRef={sortTriggerRef}
                    triggerLabel={
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{modelToInstall}</span>
                        {isPresetInstalled(modelToInstall) ? (
                          <StatusToneBadge tone="success">{t("settings.models.installedTag")}</StatusToneBadge>
                        ) : null}
                      </span>
                    }
                    ariaLabel={t("settings.models.selectSortAria")}
                  >
                    <div
                      role="listbox"
                      aria-label={t("settings.models.selectSortAria")}
                      className={SELECT_DROPDOWN_PANEL_CLASS}
                    >
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary shrink-0 gap-2">
                        <span className="text-2xs font-semibold uppercase tracking-wider text-muted min-w-0 truncate">
                          {t("settings.models.colModel")}
                        </span>
                        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
                          <span className="w-[4.75rem] shrink-0 text-center text-2xs font-semibold uppercase tracking-wider text-muted">
                            {t("settings.models.colInstalled")}
                          </span>
                          <div className="flex shrink-0 items-center gap-4">
                            <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("settings.models.colSize")}</span>
                            <span className="w-16 text-right text-2xs font-semibold uppercase tracking-wider text-muted">
                              {t("settings.models.ramMinCol")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="max-h-[280px] overflow-y-auto">
                        {(() => {
                          let rowIdx = -1;
                          return SORT_DOWNLOAD_ENTRIES.map((entry, entryIdx) => {
                            if (isSep(entry)) {
                              return (
                                <div
                                  key={`sort-sep-${entryIdx}`}
                                  className="px-3 pt-2.5 pb-1 text-2xs font-bold uppercase tracking-widest text-muted bg-bg-secondary border-b border-border select-none"
                                >
                                  {entry.label}
                                </div>
                              );
                            }
                            rowIdx++;
                            const currentRowIdx = rowIdx;
                            const m = entry as ModelPreset;
                            const isSelected = m.name === modelToInstall;
                            const onDisk = isPresetInstalled(m.name);
                            const hasEnough = systemRamGb !== null && systemRamGb >= m.minRamGb;
                            const ramColor =
                              systemRamGb === null ? "text-muted" : hasEnough ? "text-success" : "text-error";
                            return (
                              <button
                                key={`sort-${m.name}`}
                                ref={(el) => {
                                  sortRowRefs.current[currentRowIdx] = el;
                                }}
                                role="option"
                                aria-selected={isSelected}
                                type="button"
                                tabIndex={sortDropdownFocusedIndex === currentRowIdx ? 0 : -1}
                                onClick={() => selectSortPreset(m.name)}
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    const next = Math.min(currentRowIdx + 1, SORT_DOWNLOAD_PRESET_COUNT - 1);
                                    setSortDropdownFocusedIndex(next);
                                    sortRowRefs.current[next]?.focus();
                                  } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    const prev = currentRowIdx - 1;
                                    if (prev < 0) closeSortDropdown();
                                    else {
                                      setSortDropdownFocusedIndex(prev);
                                      sortRowRefs.current[prev]?.focus();
                                    }
                                  } else if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    selectSortPreset(m.name);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    closeSortDropdown();
                                  }
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left
                                  ${isSelected ? "bg-accent-light text-accent" : "text-text-primary hover:bg-hover-overlay"}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {isSelected ? (
                                    <svg className="w-3 h-3 shrink-0 text-accent" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" />
                                    </svg>
                                  ) : (
                                    <span className="w-3 shrink-0" />
                                  )}
                                  <span className="truncate">{m.name}</span>
                                </div>
                                <div className="ml-2 flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
                                  <div className="flex w-[4.75rem] shrink-0 justify-center">
                                    {onDisk ? (
                                      <StatusToneBadge tone="success">{t("settings.models.installedTag")}</StatusToneBadge>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-4">
                                    <span className="w-10 text-right text-xs text-muted">{m.sizeGb} GB</span>
                                    <span className={`w-16 text-right text-xs font-medium ${ramColor}`}>{m.minRamGb} GB RAM</span>
                                  </div>
                                </div>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </SelectDropdown>
                  {(() => {
                    const preset = MODEL_PRESETS.find((p) => p.name === modelToInstall);
                    if (!preset) return null;
                    const rows = [
                      { label: t("settings.models.ramMinCol"), needed: preset.minRamGb, device: systemRamGb },
                      { label: t("settings.models.ramRecRow"), needed: preset.recRamGb, device: systemRamGb },
                    ];
                    return (
                      <div className={resourceCardClass}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 text-muted leading-relaxed">{preset.note}</p>
                          <span className="shrink-0 pt-0.5">
                            <SpeedBadge speed={preset.speed} t={t} />
                          </span>
                        </div>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="text-muted text-2xs uppercase tracking-wider">
                              <th
                                className={`text-left pb-1.5 font-semibold ${showMachineComparisonColumns ? "w-[28%]" : "w-[42%]"}`}
                              >
                                {t("settings.models.resource")}
                              </th>
                              <th
                                className={`text-right pb-1.5 font-semibold ${showMachineComparisonColumns ? "w-[24%]" : "w-[58%]"}`}
                              >
                                {t("settings.models.needed")}
                              </th>
                              {showMachineComparisonColumns ? (
                                <th className="text-right pb-1.5 font-semibold w-[24%]">{t("settings.models.device")}</th>
                              ) : null}
                              {showMachineComparisonColumns ? (
                                <th
                                  className="text-right pb-1.5 font-semibold w-[24%]"
                                  title={t("settings.models.deltaTitle")}
                                >
                                  {t("settings.models.delta")}
                                </th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-soft">
                            {rows.map((row) => {
                              const d = diff(row.needed, row.device);
                              return (
                                <tr key={row.label}>
                                  <td className={TABLE_CELL_LABEL}>{row.label}</td>
                                  <td className={TABLE_CELL_NUM}>{row.needed} GB</td>
                                  {showMachineComparisonColumns ? (
                                    <td className={TABLE_CELL_NUM}>
                                      {row.device !== null ? (
                                        `${Math.round(row.device * 10) / 10} GB`
                                      ) : (
                                        <span className="text-muted">—</span>
                                      )}
                                    </td>
                                  ) : null}
                                  {showMachineComparisonColumns ? (
                                    <td className="py-1.5 text-right font-semibold">
                                      {d === null ? (
                                        <span className="text-muted">—</span>
                                      ) : d >= 0 ? (
                                        <span className="text-success">+{d} GB</span>
                                      ) : (
                                        <span className="text-error">{d} GB</span>
                                      )}
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                            <tr>
                              <td className={TABLE_CELL_LABEL}>{t("settings.models.neededDisk")}</td>
                              <td className={TABLE_CELL_NUM}>{preset.sizeGb} GB</td>
                              {showMachineComparisonColumns ? <td className={TABLE_CELL_MUTED_DASH}>—</td> : null}
                              {showMachineComparisonColumns ? <td className={TABLE_CELL_MUTED_DASH}>—</td> : null}
                            </tr>
                          </tbody>
                        </table>
                        <p className="text-muted text-2xs" title={t("settings.models.vramLineTitle")}>
                          {t("settings.models.vramLine", { min: preset.minVramGb, rec: preset.recVramGb })}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-2 items-stretch">
                    <button
                      type="button"
                      onClick={() => void handleInstallSortModel()}
                      disabled={installingModel || isPresetInstalled(modelToInstall)}
                      className={`${
                        showRefreshButtons ? "flex-1 min-w-[140px]" : "w-full sm:flex-1"
                      } px-3 py-2 rounded-lg bg-button-primary hover:bg-button-hover disabled:opacity-60 text-white text-sm font-medium transition-colors`}
                    >
                      {isPresetInstalled(modelToInstall)
                        ? t("settings.models.alreadyInstalled")
                        : installingModel && downloadingModel === modelToInstall
                          ? t("settings.models.downloadingEllipsis")
                          : t("settings.models.downloadSort")}
                    </button>
                    {showRefreshButtons ? (
                      <button
                        type="button"
                        onClick={() => void refreshModels()}
                        disabled={loadingModels}
                        className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-bg-secondary border border-border text-muted hover:text-text-primary hover:border-accent transition-colors text-sm"
                      >
                        {t("settings.models.refreshList")}
                      </button>
                    ) : null}
                  </div>
                  {showSortPartialEmbed ? (
                    <OllamaPartialsEmbed
                      id="download-model-partials-sort"
                      dataTour="ollama-partial-cache"
                      panelTitle={t("settings.ollamaPartials.embedTitleSort")}
                      partials={sortPartialRows}
                      totalPartialBytes={sortPartialBytes}
                      installingModel={installingModel}
                      loading={partialLoading}
                      error={partialError}
                      setError={setPartialError}
                      refresh={refreshPartials}
                      deleteGroup={deletePartialGroup}
                      deletingId={partialDeletingId}
                      prune={prunePartials}
                      pruning={partialPruning}
                      pruneAvailable={storageData?.prune_cli_available ?? false}
                      ollamaHome={storageData?.ollama_home ?? null}
                      showOllamaHomeFooter={sortPartialHomeFooter}
                    />
                  ) : null}
                </div>
                ) : null}
    
                {/* Vision — multimodal only */}
                {showVisionDownloadBlock ? (
                <div
                  className={`${blockStackClass} ${showSortDownloadBlock ? "border-t border-border-soft pt-6" : ""}`}
                  data-tour="settings-models-download-vision"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                    <h3 className="m-0 text-sm font-semibold leading-snug text-text-primary">
                      {t("settings.models.visionDownloadHeading")}
                    </h3>
                    <button
                      type="button"
                      onClick={recommendVisionModel}
                      disabled={!systemRamGb || VISION_DOWNLOAD_PRESET_COUNT === 0}
                      className={`${SECONDARY_BTN_CLASS} disabled:opacity-40 shrink-0 self-center text-xs`}
                      title={
                        !systemRamGb ? t("settings.models.ramUnavailable") : t("settings.models.recommendVisionTitle")
                      }
                    >
                      {t("settings.models.recommendMachine")}
                    </button>
                  </div>
                  {VISION_DOWNLOAD_PRESET_COUNT === 0 ? (
                    <p className="text-xs text-muted">{t("settings.models.noVisionPresets")}</p>
                  ) : (
                    <>
                      <SelectDropdown
                        open={visionModelDropdownOpen}
                        onOpenChange={(o) => {
                          if (o) openVisionDropdown();
                          else closeVisionDropdown();
                        }}
                        triggerRef={visionTriggerRef}
                        triggerLabel={
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{visionModelToInstall}</span>
                            {isPresetInstalled(visionModelToInstall) ? (
                              <StatusToneBadge tone="success">{t("settings.models.installedTag")}</StatusToneBadge>
                            ) : null}
                          </span>
                        }
                        ariaLabel={t("settings.models.selectVisionAria")}
                      >
                        <div
                          role="listbox"
                          aria-label={t("settings.models.selectVisionAria")}
                          className={SELECT_DROPDOWN_PANEL_CLASS}
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-border bg-bg-secondary px-3 py-1.5 shrink-0">
                            <span className="text-2xs font-semibold uppercase tracking-wider text-muted min-w-0 truncate">
                              {t("settings.models.colModel")}
                            </span>
                            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
                              <span className="w-[4.75rem] shrink-0 text-center text-2xs font-semibold uppercase tracking-wider text-muted">
                                {t("settings.models.colInstalled")}
                              </span>
                              <div className="flex shrink-0 items-center gap-4">
                                <span className="text-2xs font-semibold uppercase tracking-wider text-muted">
                                  {t("settings.models.colSize")}
                                </span>
                                <span className="w-16 text-right text-2xs font-semibold uppercase tracking-wider text-muted">
                                  {t("settings.models.ramMinCol")}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="max-h-[280px] overflow-y-auto">
                            {(() => {
                              let rowIdx = -1;
                              return VISION_DOWNLOAD_ENTRIES.map((entry, entryIdx) => {
                                if (isSep(entry)) {
                                  return (
                                    <div
                                      key={`vis-sep-${entryIdx}`}
                                      className="px-3 pt-2.5 pb-1 text-2xs font-bold uppercase tracking-widest text-muted bg-bg-secondary border-b border-border select-none"
                                    >
                                      {entry.label}
                                    </div>
                                  );
                                }
                                rowIdx++;
                                const currentRowIdx = rowIdx;
                                const m = entry as ModelPreset;
                                const isSelected = m.name === visionModelToInstall;
                                const onDisk = isPresetInstalled(m.name);
                                const hasEnough = systemRamGb !== null && systemRamGb >= m.minRamGb;
                                const ramColor =
                                  systemRamGb === null ? "text-muted" : hasEnough ? "text-success" : "text-error";
                                return (
                                  <button
                                    key={`vis-${m.name}`}
                                    ref={(el) => {
                                      visionRowRefs.current[currentRowIdx] = el;
                                    }}
                                    role="option"
                                    aria-selected={isSelected}
                                    type="button"
                                    tabIndex={visionDropdownFocusedIndex === currentRowIdx ? 0 : -1}
                                    onClick={() => selectVisionPreset(m.name)}
                                    onKeyDown={(e) => {
                                      if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        const next = Math.min(currentRowIdx + 1, VISION_DOWNLOAD_PRESET_COUNT - 1);
                                        setVisionDropdownFocusedIndex(next);
                                        visionRowRefs.current[next]?.focus();
                                      } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        const prev = currentRowIdx - 1;
                                        if (prev < 0) closeVisionDropdown();
                                        else {
                                          setVisionDropdownFocusedIndex(prev);
                                          visionRowRefs.current[prev]?.focus();
                                        }
                                      } else if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        selectVisionPreset(m.name);
                                      } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        closeVisionDropdown();
                                      }
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left
                                      ${isSelected ? "bg-info-soft/50 text-info" : "text-text-primary hover:bg-hover-overlay"}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {isSelected ? (
                                        <svg className="w-3 h-3 shrink-0 text-info" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" />
                                        </svg>
                                      ) : (
                                        <span className="w-3 shrink-0" />
                                      )}
                                      <span className="truncate">{m.name}</span>
                                    </div>
                                    <div className="ml-2 flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
                                      <div className="flex w-[4.75rem] shrink-0 justify-center">
                                        {onDisk ? (
                                          <StatusToneBadge tone="success">{t("settings.models.installedTag")}</StatusToneBadge>
                                        ) : null}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-4">
                                        <span className="w-10 text-right text-xs text-muted">{m.sizeGb} GB</span>
                                        <span className={`w-16 text-right text-xs font-medium ${ramColor}`}>{m.minRamGb} GB RAM</span>
                                      </div>
                                    </div>
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </SelectDropdown>
                      {(() => {
                        const preset = MODEL_PRESETS.find((p) => p.name === visionModelToInstall);
                        if (!preset) return null;
                        const rows = [
                          { label: t("settings.models.ramMinCol"), needed: preset.minRamGb, device: systemRamGb },
                          { label: t("settings.models.ramRecRow"), needed: preset.recRamGb, device: systemRamGb },
                        ];
                        return (
                          <div className={resourceCardClass}>
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 flex-1 text-muted leading-relaxed">{preset.note}</p>
                              <span className="shrink-0 pt-0.5">
                                <SpeedBadge speed={preset.speed} t={t} />
                              </span>
                            </div>
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="text-muted text-2xs uppercase tracking-wider">
                                  <th
                                    className={`text-left pb-1.5 font-semibold ${showMachineComparisonColumns ? "w-[28%]" : "w-[42%]"}`}
                                  >
                                    {t("settings.models.resource")}
                                  </th>
                                  <th
                                    className={`text-right pb-1.5 font-semibold ${showMachineComparisonColumns ? "w-[24%]" : "w-[58%]"}`}
                                  >
                                    {t("settings.models.needed")}
                                  </th>
                                  {showMachineComparisonColumns ? (
                                    <th className="text-right pb-1.5 font-semibold w-[24%]">{t("settings.models.device")}</th>
                                  ) : null}
                                  {showMachineComparisonColumns ? (
                                    <th
                                      className="text-right pb-1.5 font-semibold w-[24%]"
                                      title={t("settings.models.deltaTitle")}
                                    >
                                      {t("settings.models.delta")}
                                    </th>
                                  ) : null}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border-soft">
                                {rows.map((row) => {
                                  const d = diff(row.needed, row.device);
                                  return (
                                    <tr key={row.label}>
                                      <td className={TABLE_CELL_LABEL}>{row.label}</td>
                                      <td className={TABLE_CELL_NUM}>{row.needed} GB</td>
                                      {showMachineComparisonColumns ? (
                                        <td className={TABLE_CELL_NUM}>
                                          {row.device !== null ? (
                                            `${Math.round(row.device * 10) / 10} GB`
                                          ) : (
                                            <span className="text-muted">—</span>
                                          )}
                                        </td>
                                      ) : null}
                                      {showMachineComparisonColumns ? (
                                        <td className="py-1.5 text-right font-semibold">
                                          {d === null ? (
                                            <span className="text-muted">—</span>
                                          ) : d >= 0 ? (
                                            <span className="text-success">+{d} GB</span>
                                          ) : (
                                            <span className="text-error">{d} GB</span>
                                          )}
                                        </td>
                                      ) : null}
                                    </tr>
                                  );
                                })}
                                <tr>
                                  <td className={TABLE_CELL_LABEL}>{t("settings.models.neededDisk")}</td>
                                  <td className={TABLE_CELL_NUM}>{preset.sizeGb} GB</td>
                                  {showMachineComparisonColumns ? <td className={TABLE_CELL_MUTED_DASH}>—</td> : null}
                                  {showMachineComparisonColumns ? <td className={TABLE_CELL_MUTED_DASH}>—</td> : null}
                                </tr>
                              </tbody>
                            </table>
                            <p className="text-muted text-2xs" title={t("settings.models.vramLineTitle")}>
                              {t("settings.models.vramLine", { min: preset.minVramGb, rec: preset.recVramGb })}
                            </p>
                          </div>
                        );
                      })()}
                    </>
                  )}
                  {(VISION_DOWNLOAD_PRESET_COUNT > 0 || showRefreshButtons) && (
                  <div className="flex flex-wrap gap-2 items-stretch">
                    {VISION_DOWNLOAD_PRESET_COUNT > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleInstallVisionModel()}
                        disabled={installingModel || isPresetInstalled(visionModelToInstall)}
                        className={`${
                          showRefreshButtons ? "flex-1 min-w-[140px]" : "w-full sm:flex-1"
                        } px-3 py-2 rounded-lg bg-button-primary hover:bg-button-hover disabled:opacity-60 text-white text-sm font-medium transition-colors`}
                      >
                        {isPresetInstalled(visionModelToInstall)
                          ? t("settings.models.alreadyInstalled")
                          : installingModel && downloadingModel === visionModelToInstall
                            ? t("settings.models.downloadingEllipsis")
                            : t("settings.models.downloadVision")}
                      </button>
                    )}
                    {showRefreshButtons ? (
                      <button
                        type="button"
                        onClick={() => void refreshModels()}
                        disabled={loadingModels}
                        className={`px-3 py-2 rounded-lg bg-bg-secondary border border-border text-muted hover:text-text-primary hover:border-accent transition-colors text-sm ${
                          VISION_DOWNLOAD_PRESET_COUNT > 0 ? "flex-1 min-w-[140px]" : "w-full"
                        }`}
                      >
                        {t("settings.models.refreshList")}
                      </button>
                    ) : null}
                  </div>
                  )}
                  {showVisionPartialEmbed ? (
                    <OllamaPartialsEmbed
                      id="download-model-partials-vision"
                      dataTour="ollama-partial-cache-vision"
                      panelTitle={t("settings.ollamaPartials.embedTitleVision")}
                      partials={visionPartialRows}
                      totalPartialBytes={visionPartialBytes}
                      installingModel={installingModel}
                      loading={partialLoading}
                      error={partialError}
                      setError={setPartialError}
                      refresh={refreshPartials}
                      deleteGroup={deletePartialGroup}
                      deletingId={partialDeletingId}
                      prune={prunePartials}
                      pruning={partialPruning}
                      pruneAvailable={storageData?.prune_cli_available ?? false}
                      ollamaHome={storageData?.ollama_home ?? null}
                      showOllamaHomeFooter={visionPartialHomeFooter}
                    />
                  ) : null}
                </div>
                ) : null}
    
                {installMessage && (
                  <p className={`text-xs ${installMessage.startsWith("Failed") ? "text-error" : "text-muted"}`}>
                    {installMessage}
                    <button type="button" onClick={() => setInstallMessage(null)} className="ml-2 opacity-50 hover:opacity-100">✕</button>
                  </p>
                )}
                <p className={`text-xs text-muted ${isModalScope ? "leading-relaxed" : ""}`}>
                  {t("settings.models.queueHint", {
                    queue:
                      installQueueCount > 0 ? t("settings.models.queueWaiting", { count: installQueueCount }) : "",
                  })}
                </p>
    </div>
  );
}
