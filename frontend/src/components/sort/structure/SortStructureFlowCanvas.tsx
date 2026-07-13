import { useMemo, useState } from "react";
import type { SortStructureModule } from "../../../types/sortStructure";
import {
  newSortStructureModule,
  SORT_STRUCTURE_MAX_DEPTH,
} from "../../../types/sortStructure";
import { SORT_STRUCTURE_CAPS_UI_ENABLED } from "../../../constants";
import { useI18n } from "../../../i18n/I18nContext";
import { themeLabel } from "../../../utils/sortStructureSummaryText";
import {
  appendChildToModule,
  moduleToChain,
  removeModuleById,
  updateModuleById,
} from "../../../utils/sortStructureTreeOps";
import SelectDropdown, {
  SELECT_DROPDOWN_PANEL_CLASS,
  selectDropdownPlainOptionClassName,
} from "../../ui/SelectDropdown";
import { SECTION_LABEL_CLASS } from "../../../utils/styles";
import { SortStructureFlowNodeCard, SORT_STRUCTURE_FLOW_CARD_SIZE_CLASS } from "./SortStructureFlowNodeCard";

const THEME_OPTIONS = [
  "document_type",
  "country",
  "language",
  "year",
  "person",
  "organization",
  "property",
  "project",
  "work",
  "auto",
  "custom",
] as const;

interface SortStructureFlowCanvasProps {
  modules: SortStructureModule[];
  onModulesChange: (modules: SortStructureModule[]) => void;
}

function FlowConnector() {
  return (
    <div className="mx-4 flex shrink-0 items-center justify-center self-stretch py-1" aria-hidden>
      <svg className="text-muted/80" width="24" height="16" viewBox="0 0 24 16">
        <path
          d="M2 8h14m0 0-3-3m3 3-3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Horizontal git-flow-style module tree — rectangles connected left-to-right per branch.
 */
export default function SortStructureFlowCanvas({ modules, onModulesChange }: SortStructureFlowCanvasProps) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(modules[0]?.id ?? null);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

  const selected = useMemo(
    () => (selectedId ? modules.flatMap((m) => flattenModules(m)).find((m) => m.id === selectedId) ?? null : null),
    [modules, selectedId]
  );

  const patchSelected = (next: SortStructureModule) => {
    onModulesChange(updateModuleById(modules, next.id, next));
  };

  const removeModule = (id: string) => {
    const next = removeModuleById(modules, id);
    onModulesChange(next);
    setSelectedId((current) => {
      if (current === id) return next[0]?.id ?? null;
      return current;
    });
  };

  const removeSelected = () => {
    if (!selectedId) return;
    removeModule(selectedId);
  };

  if (!modules.length) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-bg-secondary/30 px-4 py-6 text-center"
        data-testid="structure-flow-empty"
      >
        <p className="text-sm font-medium text-text-primary">{t("settings.sortStructure.flowEmptyTitle")}</p>
        <p className="mt-1 text-2xs text-muted leading-relaxed max-w-sm mx-auto">
          {t("settings.sortStructure.flowEmptyBody")}
        </p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent hover:bg-accent-soft/80"
          onClick={() => {
            const root = newSortStructureModule({ theme: "document_type" });
            onModulesChange([root]);
            setSelectedId(root.id);
          }}
        >
          {t("settings.sortStructure.flowEmptyCta")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="structure-flow-canvas">
      <p className="text-2xs text-muted">{t("settings.sortStructure.flowCanvasHint")}</p>
      <div className="min-w-0 max-w-full overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-min flex-col gap-5">
          {modules.map((root) => {
            const chain = moduleToChain(root);
            return (
              <div
                key={root.id}
                className="flex items-stretch py-1"
                role="group"
                aria-label={t("settings.sortStructure.flowBranchAria")}
              >
                {chain.map((mod, index) => (
                  <div key={mod.id} className="flex items-stretch">
                    {index > 0 ? <FlowConnector /> : null}
                    <SortStructureFlowNodeCard
                      module={mod}
                      levelIndex={index}
                      selected={selectedId === mod.id}
                      onSelect={() => setSelectedId(mod.id)}
                      onRemove={() => removeModule(mod.id)}
                    />
                  </div>
                ))}
                {chain.length < SORT_STRUCTURE_MAX_DEPTH &&
                chain[chain.length - 1].children.length === 0 ? (
                  <>
                    <FlowConnector />
                    <button
                      type="button"
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-accent transition-colors hover:border-accent hover:bg-accent-soft/30 ${SORT_STRUCTURE_FLOW_CARD_SIZE_CLASS}`}
                      aria-label={t("settings.sortStructure.addNestedLevel")}
                      onClick={() => {
                        const parent = chain[chain.length - 1];
                        const child = newSortStructureModule();
                        onModulesChange(appendChildToModule(modules, parent.id, child));
                        setSelectedId(child.id);
                      }}
                    >
                      <span className="text-xl leading-none">+</span>
                      <span className="text-[10px] font-medium">{t("settings.sortStructure.addLevel")}</span>
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div className="space-y-3" data-testid="structure-flow-editor">
          <p className="text-sm font-medium text-text-primary">
            {t("settings.sortStructure.flowEditorTitle", {
              level: chainIndexOf(modules, selected.id) + 1,
              label: themeLabel(selected.theme, t, selected.customLabel),
            })}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1 max-w-md">
              <label className={SECTION_LABEL_CLASS} htmlFor="structure-flow-theme">
                {t("settings.sortStructure.flowGroupByLabel")}
              </label>
              <div className="mt-1">
                <SelectDropdown
                  open={themeDropdownOpen}
                  onOpenChange={setThemeDropdownOpen}
                  triggerId="structure-flow-theme"
                  triggerLabel={themeLabel(selected.theme, t, selected.customLabel)}
                  ariaLabel={t("settings.sortStructure.flowGroupByLabel")}
                  portaled
                >
                  <div
                    role="listbox"
                    aria-label={t("settings.sortStructure.flowGroupByLabel")}
                    className={`${SELECT_DROPDOWN_PANEL_CLASS} min-w-[12rem]`}
                  >
                    {THEME_OPTIONS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        role="option"
                        aria-selected={selected.theme === id}
                        onClick={() => {
                          patchSelected({ ...selected, theme: id });
                          setThemeDropdownOpen(false);
                        }}
                        className={selectDropdownPlainOptionClassName(selected.theme === id)}
                      >
                        {themeLabel(id, t, selected.customLabel)}
                      </button>
                    ))}
                  </div>
                </SelectDropdown>
              </div>
            </div>
            {selected.theme === "custom" ? (
              <label className="flex flex-col gap-1 text-2xs text-muted flex-1 min-w-[8rem]">
                {t("settings.sortStructure.customLabel")}
                <input
                  type="text"
                  className="rounded-lg border border-border bg-bg-primary px-2 py-1.5 text-sm"
                  value={selected.customLabel ?? ""}
                  onChange={(e) => patchSelected({ ...selected, customLabel: e.target.value })}
                  placeholder={t("settings.sortStructure.customLabelPlaceholder")}
                />
              </label>
            ) : null}
            {SORT_STRUCTURE_CAPS_UI_ENABLED ? (
              <label className="flex flex-col gap-1 text-2xs text-muted w-28">
                {t("settings.sortStructure.flowMaxFoldersHint")}
                <input
                  type="number"
                  min={1}
                  max={99}
                  className="rounded-lg border border-border bg-bg-primary px-2 py-1.5 text-sm"
                  value={selected.maxFolders ?? ""}
                  placeholder={t("settings.sortStructure.flowMaxFoldersPlaceholder")}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    patchSelected({
                      ...selected,
                      maxFolders: v ? Math.min(99, Math.max(1, parseInt(v, 10))) : null,
                    });
                  }}
                />
              </label>
            ) : null}
            <button
              type="button"
              className="text-2xs text-destructive hover:underline pb-1.5"
              onClick={removeSelected}
            >
              {t("settings.sortStructure.removeLevel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function flattenModules(mod: SortStructureModule): SortStructureModule[] {
  return [mod, ...mod.children.flatMap(flattenModules)];
}

function chainIndexOf(modules: SortStructureModule[], id: string): number {
  for (const root of modules) {
    const chain = moduleToChain(root);
    const idx = chain.findIndex((m) => m.id === id);
    if (idx >= 0) return idx;
  }
  return 0;
}
