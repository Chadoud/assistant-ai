import { useRef, useState, type ChangeEventHandler } from "react";
import type { AppSettings } from "../../../types/settings";
import type { SortStructureTemplate } from "../../../types/sortStructure";
import {
  DEFAULT_SORT_STRUCTURE_TEMPLATE,
  newSortStructureModule,
} from "../../../types/sortStructure";
import { SORT_STRUCTURE_TEMPLATES_ENABLED } from "../../../constants";
import { SECTION_LABEL_CLASS } from "../../../utils/styles";
import { useI18n } from "../../../i18n/I18nContext";
import { buildSortStructureSummary } from "../../../utils/sortStructureSummaryText";
import { parseStructurePackJson } from "../../../utils/sortStructurePack";
import { trackSortStructurePackImported } from "../../../telemetry/sortStructureTelemetry";
import { BUNDLED_STRUCTURE_PACKS } from "./bundledStructurePacks";
import SortStructureFlowCanvas from "./SortStructureFlowCanvas";
import { SORT_STRIP_PRESET_CHIP_CLASS } from "../instructions/sortInstructionsStripStyles";

const STRUCTURE_PACKS_BASE = `${import.meta.env.BASE_URL}structure-packs/`;

interface SortStructureBuilderProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  /** Strip inline panel — flow canvas, no duplicate outer card. */
  embedded?: boolean;
  /** Sort strip with Structure mode — hide enable toggle (mode implies on). */
  stripInline?: boolean;
}

/**
 * Visual editor for nested folder structure templates.
 */
export default function SortStructureBuilder({
  settings,
  onSettingsPatch,
  embedded = false,
  stripInline = false,
}: SortStructureBuilderProps) {
  const { t } = useI18n();
  const packFileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (!SORT_STRUCTURE_TEMPLATES_ENABLED) return null;

  const tpl: SortStructureTemplate = settings.sortStructureTemplate ?? DEFAULT_SORT_STRUCTURE_TEMPLATE;
  const structureActive = stripInline || tpl.enabled;

  const patchTemplate = (patch: Partial<SortStructureTemplate>) => {
    onSettingsPatch({
      sortStructureTemplate: { ...tpl, ...patch },
    });
  };

  const importBundledPack = async (filename: string) => {
    try {
      setImportError(null);
      const res = await fetch(`${STRUCTURE_PACKS_BASE}${filename}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseStructurePackJson(await res.json());
      onSettingsPatch({ sortStructureTemplate: parsed, sortClassifyMode: "structure" });
      trackSortStructurePackImported(settings.telemetryOptIn, settings.uiLocale, filename);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("settings.sortStructure.importFailed"));
    }
  };

  const onPickPackFile: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImportError(null);
      const parsed = parseStructurePackJson(JSON.parse(await file.text()));
      onSettingsPatch({ sortStructureTemplate: parsed, sortClassifyMode: "structure" });
      trackSortStructurePackImported(settings.telemetryOptIn, settings.uiLocale, file.name);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("settings.sortStructure.importFailed"));
    }
  };

  const summary = buildSortStructureSummary(tpl.modules, t, { showCaps: true });

  const presetsRow = (
    <div className="space-y-2">
      <p className="text-2xs font-medium text-muted">{t("settings.sortStructure.presetsLabel")}</p>
      <div className="flex flex-wrap gap-1.5">
        {BUNDLED_STRUCTURE_PACKS.map(({ file, labelKey }) => (
          <button
            key={file}
            type="button"
            className={SORT_STRIP_PRESET_CHIP_CLASS}
            onClick={() => void importBundledPack(file)}
          >
            {t(labelKey)}
          </button>
        ))}
        <button type="button" className={SORT_STRIP_PRESET_CHIP_CLASS} onClick={() => packFileRef.current?.click()}>
          {t("settings.sortStructure.importPack")}
        </button>
        <input ref={packFileRef} type="file" accept="application/json,.json" className="hidden" onChange={onPickPackFile} />
      </div>
    </div>
  );

  const enabledBody = (
    <>
      {!embedded ? <p className="text-sm text-text-secondary">{summary}</p> : null}
      <SortStructureFlowCanvas
        modules={tpl.modules}
        onModulesChange={(modules) => patchTemplate({ modules, enabled: true })}
      />
      {stripInline && tpl.modules.length > 0 ? (
        <button
          type="button"
          className="text-2xs font-medium text-accent hover:underline"
          onClick={() =>
            patchTemplate({ modules: [...tpl.modules, newSortStructureModule({ theme: "document_type" })] })
          }
        >
          {t("settings.sortStructure.addBranch")}
        </button>
      ) : null}
      {presetsRow}
      {importError ? <p className="text-2xs text-destructive">{importError}</p> : null}
    </>
  );

  if (stripInline) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-secondary leading-relaxed">{t("settings.sortStructure.stripFlowHint")}</p>
        {enabledBody}
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-primary">{t("settings.sortStructure.title")}</p>
          <label className="flex items-center gap-2 text-2xs text-text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={tpl.enabled}
              onChange={(e) => patchTemplate({ enabled: e.target.checked })}
              className="rounded border-border"
            />
            {t("settings.sortStructure.enableToggle")}
          </label>
        </div>
        <p className="text-2xs text-muted leading-relaxed">{t("settings.sortStructure.flowHint")}</p>
        {structureActive ? enabledBody : (
          <p className="text-2xs text-text-secondary">{t("settings.sortStructure.builtinActive")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg-secondary/30 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.sortStructure.title")}</label>
        <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <input
            type="checkbox"
            checked={tpl.enabled}
            onChange={(e) => patchTemplate({ enabled: e.target.checked })}
            className="rounded border-border"
          />
          {t("settings.sortStructure.enableToggle")}
        </label>
      </div>
      <p className="text-2xs text-muted leading-relaxed">{t("settings.sortStructure.hint")}</p>
      {structureActive ? enabledBody : (
        <p className="text-2xs text-text-secondary">{t("settings.sortStructure.builtinActive")}</p>
      )}
    </div>
  );
}
