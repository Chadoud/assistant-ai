import { useRef, useState, type ChangeEventHandler } from "react";
import type { AppSettings, AutomationPreset, UserRule } from "../../types/settings";
import { CONFIDENCE_LOW } from "../../constants";
import { SECTION_LABEL_CLASS } from "../../utils/styles";
import {
  DEFAULT_CUSTOM_MIN_CONFIDENCE,
  PRESET_MIN_AGGRESSIVE,
  PRESET_MIN_STRICT,
} from "../../utils/automationPreset";
import { mergeRulePack, parseRulePackJson } from "../../utils/rulePack";
import HoverHelpCard from "../ui/HoverHelpCard";
import SelectDropdown, {
  SELECT_DROPDOWN_PANEL_CLASS,
  selectDropdownPlainOptionClassName,
} from "../ui/SelectDropdown";
import { useI18n } from "../../i18n/I18nContext";

const SERVER_DEFAULT_PCT = Math.round(CONFIDENCE_LOW * 100);

function presetLabelFn(p: AutomationPreset, t: (k: string, v?: Record<string, string | number>) => string) {
  switch (p) {
    case "strict":
      return t("settings.rules.presetStrict");
    case "balanced":
      return t("settings.rules.presetBalanced");
    case "aggressive":
      return t("settings.rules.presetAggressive");
    case "custom":
      return t("settings.rules.presetCustom");
    default:
      return p;
  }
}

function newRule(): UserRule {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}`,
    enabled: true,
    priority: 0,
    pattern: "*.pdf",
    action: "target_folder",
    folder: "Documents",
  };
}

interface RulesSectionProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
}

const RULE_PACKS_BASE = `${import.meta.env.BASE_URL}rule-packs/`;

export default function RulesSection({ settings, onSettingsPatch }: RulesSectionProps) {
  const { t } = useI18n();
  const rules = settings.rules ?? [];
  const packFileRef = useRef<HTMLInputElement>(null);
  const [openActionRuleId, setOpenActionRuleId] = useState<string | null>(null);
  const [automationPresetOpen, setAutomationPresetOpen] = useState(false);

  const patchCustomConfidence = (minConfidence: number | null) => {
    onSettingsPatch({ automationPreset: "custom", minConfidence });
  };

  const applyPreset = (p: AutomationPreset) => {
    if (p === "strict") onSettingsPatch({ automationPreset: "strict", minConfidence: PRESET_MIN_STRICT });
    else if (p === "balanced") onSettingsPatch({ automationPreset: "balanced", minConfidence: null });
    else if (p === "aggressive") onSettingsPatch({ automationPreset: "aggressive", minConfidence: PRESET_MIN_AGGRESSIVE });
    else
      onSettingsPatch({
        automationPreset: "custom",
        minConfidence: settings.minConfidence ?? DEFAULT_CUSTOM_MIN_CONFIDENCE,
      });
  };

  const mergePackRules = (incoming: UserRule[]) => {
    onSettingsPatch({ rules: mergeRulePack(rules, incoming) });
  };

  const onPickPackFile: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      mergePackRules(parseRulePackJson(parsed));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t("settings.rules.alertReadPack"));
    }
  };

  const importBundledPack = async (filename: string) => {
    try {
      const res = await fetch(`${RULE_PACKS_BASE}${filename}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      mergePackRules(parseRulePackJson(await res.json()));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t("settings.rules.alertLoadPack"));
    }
  };

  const updateRule = (id: string, patch: Partial<UserRule>) => {
    onSettingsPatch({
      rules: rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeRule = (id: string) => {
    onSettingsPatch({ rules: rules.filter((r) => r.id !== id) });
  };

  const minConfidenceHint = (
    <>
      <p className="mb-2">{t("settings.rules.confidenceWhat")}</p>
      <p className="mb-2">{t("settings.rules.confidenceServer", { pct: SERVER_DEFAULT_PCT })}</p>
      <p>{t("settings.rules.confidenceTip")}</p>
    </>
  );

  return (
    <div className="space-y-3">
      <div data-tour="settings-rules-patterns">
        <HoverHelpCard hint={t("settings.rules.intro")} className="mb-2 block">
          <label className={SECTION_LABEL_CLASS}>{t("settings.rules.title")}</label>
        </HoverHelpCard>
        <div className="space-y-2">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex flex-col sm:flex-row sm:flex-wrap gap-2 p-3 rounded-lg border border-border bg-bg-secondary/80"
            >
              <label className="flex items-center gap-2 text-2xs text-muted shrink-0">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => updateRule(r.id, { enabled: e.target.checked })}
                  className="rounded border-border"
                />
                {t("settings.rules.on")}
              </label>
              <div className="flex items-center gap-1">
                <span className="text-2xs text-muted whitespace-nowrap">{t("settings.rules.priority")}</span>
                <input
                  type="number"
                  value={r.priority}
                  onChange={(e) => updateRule(r.id, { priority: Number(e.target.value) || 0 })}
                  className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-xs text-text-primary"
                />
              </div>
              <input
                type="text"
                value={r.pattern}
                onChange={(e) => updateRule(r.id, { pattern: e.target.value })}
                placeholder={t("settings.rules.patternPh")}
                className="flex-1 min-w-[120px] rounded border border-border bg-bg-card px-2 py-1 text-xs text-text-primary font-mono"
              />
              <div className="shrink-0 min-w-[9rem]">
                <SelectDropdown
                  open={openActionRuleId === r.id}
                  onOpenChange={(o) => {
                    if (o) setOpenActionRuleId(r.id);
                    else setOpenActionRuleId((cur) => (cur === r.id ? null : cur));
                  }}
                  triggerLabel={
                    r.action === "target_folder"
                      ? t("settings.rules.actionTarget")
                      : t("settings.rules.actionSkip")
                  }
                  ariaLabel={t("settings.rules.ruleActionAria")}
                  triggerClassName="!text-xs !py-1 !px-2"
                >
                  <div
                    role="listbox"
                    aria-label={t("settings.rules.ruleActionAria")}
                    className={SELECT_DROPDOWN_PANEL_CLASS}
                  >
                    {(["target_folder", "skip"] as const).map((action) => (
                      <button
                        key={action}
                        type="button"
                        role="option"
                        aria-selected={r.action === action}
                        onClick={() => {
                          updateRule(r.id, {
                            action,
                            folder: action === "skip" ? undefined : r.folder,
                          });
                          setOpenActionRuleId(null);
                        }}
                        className={selectDropdownPlainOptionClassName(r.action === action)}
                      >
                        {action === "target_folder"
                          ? t("settings.rules.actionTarget")
                          : t("settings.rules.actionSkip")}
                      </button>
                    ))}
                  </div>
                </SelectDropdown>
              </div>
              {r.action === "target_folder" && (
                <input
                  type="text"
                  value={r.folder ?? ""}
                  onChange={(e) => updateRule(r.id, { folder: e.target.value })}
                  placeholder={t("settings.rules.folderPh")}
                  className="flex-1 min-w-[100px] rounded border border-border bg-bg-card px-2 py-1 text-xs text-text-primary"
                />
              )}
              <button
                type="button"
                onClick={() => removeRule(r.id)}
                className="text-2xs text-error hover:underline self-start sm:self-center"
              >
                {t("settings.rules.remove")}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onSettingsPatch({ rules: [...rules, newRule()] })}
          className="mt-2 text-xs font-medium text-accent hover:underline"
        >
          {t("settings.rules.addRule")}
        </button>
        <input ref={packFileRef} type="file" accept="application/json,.json" className="hidden" onChange={onPickPackFile} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-2xs text-muted">{t("settings.rules.packsLabel")}</span>
          <button
            type="button"
            onClick={() => void importBundledPack("office-starter-v1.json")}
            className="text-xs font-medium text-accent hover:underline"
          >
            {t("settings.rules.importOffice")}
          </button>
          <span className="text-muted text-2xs">·</span>
          <button
            type="button"
            onClick={() => packFileRef.current?.click()}
            className="text-xs font-medium text-accent hover:underline"
          >
            {t("settings.rules.importJson")}
          </button>
        </div>
        <p className="text-2xs text-muted mt-1 max-w-xl">{t("settings.rules.packsFoot")}</p>
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border-soft"
        data-tour="settings-automation-confidence"
      >
        <div>
          <label className={SECTION_LABEL_CLASS}>{t("settings.rules.onCollision")}</label>
          <div className="flex flex-col gap-1.5 mt-1">
            {(
              [
                ["uniquify", t("settings.rules.collisionRename")] as const,
                ["error", t("settings.rules.collisionError")] as const,
              ] as const
            ).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input
                  type="radio"
                  name="onCollision"
                  checked={settings.onCollision === val}
                  onChange={() => onSettingsPatch({ onCollision: val })}
                  className="border-border"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={SECTION_LABEL_CLASS} htmlFor="automation-preset">
            {t("settings.rules.automationPreset")}
          </label>
          <p className="text-2xs text-muted mt-0.5 mb-2 max-w-xl">{t("settings.rules.automationIntro")}</p>
          <div className="mt-1 max-w-md">
            <SelectDropdown
              open={automationPresetOpen}
              onOpenChange={setAutomationPresetOpen}
              triggerId="automation-preset"
              triggerLabel={presetLabelFn(settings.automationPreset, t)}
              ariaLabel={t("settings.rules.automationPreset")}
            >
              <div
                role="listbox"
                aria-label={t("settings.rules.automationPreset")}
                className={SELECT_DROPDOWN_PANEL_CLASS}
              >
                {(["strict", "balanced", "aggressive", "custom"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="option"
                    aria-selected={settings.automationPreset === p}
                    onClick={() => {
                      applyPreset(p);
                      setAutomationPresetOpen(false);
                    }}
                    className={selectDropdownPlainOptionClassName(settings.automationPreset === p)}
                  >
                    {presetLabelFn(p, t)}
                  </button>
                ))}
              </div>
            </SelectDropdown>
          </div>
          {settings.automationPreset !== "custom" && (
            <p className="text-2xs text-muted mt-2">
              {settings.automationPreset === "balanced" && <>{t("settings.rules.hintBalanced")}</>}
              {settings.automationPreset === "strict" && <>{t("settings.rules.hintStrict")}</>}
              {settings.automationPreset === "aggressive" && <>{t("settings.rules.hintAggressive")}</>}
            </p>
          )}
          {settings.automationPreset === "custom" && (
            <p className="text-2xs text-muted mt-2 max-w-xl">{t("settings.rules.hintCustomThreshold")}</p>
          )}

          {settings.automationPreset === "custom" ? (
            <div className="mt-4 max-w-md space-y-3" data-tour="settings-automation-custom-threshold">
              <p className="text-2xs text-muted leading-relaxed">{t("settings.rules.expertIntro")}</p>
              <HoverHelpCard hint={minConfidenceHint} className="inline-block w-fit max-w-full">
                <div className={SECTION_LABEL_CLASS}>{t("settings.rules.minConfidenceTitle")}</div>
              </HoverHelpCard>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted">{t("settings.rules.thresholdLabel")}</span>
                  <span className="text-lg font-bold tabular-nums text-accent min-w-[3.5rem] text-right">
                    {Math.round((settings.minConfidence ?? DEFAULT_CUSTOM_MIN_CONFIDENCE) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round((settings.minConfidence ?? DEFAULT_CUSTOM_MIN_CONFIDENCE) * 100)}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    if (!Number.isFinite(pct)) return;
                    patchCustomConfidence(Math.min(1, Math.max(0, pct / 100)));
                  }}
                  className="w-full h-2 cursor-pointer accent-accent bg-surface-subtle rounded-full"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((settings.minConfidence ?? DEFAULT_CUSTOM_MIN_CONFIDENCE) * 100)}
                  aria-label={t("settings.rules.thresholdAria")}
                />
                <div className="flex justify-between text-2xs text-muted gap-2">
                  <span>{t("settings.rules.rangeLow")}</span>
                  <span className="text-right">{t("settings.rules.rangeHigh")}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label htmlFor="min-conf-num" className="text-2xs text-muted shrink-0">
                    {t("settings.rules.exactValue")}
                  </label>
                  <input
                    id="min-conf-num"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.minConfidence ?? DEFAULT_CUSTOM_MIN_CONFIDENCE}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (v === "") return;
                      const n = Number(v);
                      if (!Number.isFinite(n)) return;
                      patchCustomConfidence(Math.min(1, Math.max(0, n)));
                    }}
                    className="w-24 rounded border border-border bg-bg-card px-2 py-1 text-xs text-text-primary font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
