import { useCallback, useEffect, useMemo, useState } from "react";
import HoverHelpCard from "../ui/HoverHelpCard";
import { SECTION_LABEL_CLASS } from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";

const KEYS = {
  narrow: "OLLAMA_NARROW_TIE_BREAK",
  narrowMargin: "OLLAMA_NARROW_MARGIN",
  margin: "CANDIDATE_MARGIN_THRESHOLD",
  extractionFloor: "EXTRACTION_UNCERTAIN_QUALITY",
} as const;

/** Slider ranges — match sensible env bounds; defaults match backend defaults when unset. */
/** Matches backend default ``OLLAMA_NARROW_MARGIN`` (stricter = fewer extra narrow LLM calls). */
const NARROW_MARGIN = { min: 0.05, max: 0.25, default: 0.06, step: 0.01 } as const;
const CANDIDATE_MARGIN = { min: 0.03, max: 0.2, default: 0.08, step: 0.01 } as const;
const EXTRACTION = { min: 0.15, max: 0.55, default: 0.35, step: 0.01 } as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function parseNum(s: string, fallback: number): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function formatFixed(n: number, d: number): string {
  return n.toFixed(d);
}

type OverridesState = Partial<Record<string, string | boolean>>;

export default function AdvancedClassificationSection() {
  const { t } = useI18n();
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  const supported = Boolean(api?.getBackendEnvOverrides && api?.setBackendEnvOverrides);

  const [narrow, setNarrow] = useState(false);
  const [narrowMargin, setNarrowMargin] = useState<number>(NARROW_MARGIN.default);
  const [margin, setMargin] = useState<number>(CANDIDATE_MARGIN.default);
  const [extractionFloor, setExtractionFloor] = useState<number>(EXTRACTION.default);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supported || !api?.getBackendEnvOverrides) return;
    const raw = (await api.getBackendEnvOverrides()) as OverridesState;
    const n = raw[KEYS.narrow];
    setNarrow(n === true || n === "1" || String(n).toLowerCase() === "true");
    setNarrowMargin(
      clamp(parseNum(String(raw[KEYS.narrowMargin] ?? ""), NARROW_MARGIN.default), NARROW_MARGIN.min, NARROW_MARGIN.max)
    );
    setMargin(
      clamp(parseNum(String(raw[KEYS.margin] ?? ""), CANDIDATE_MARGIN.default), CANDIDATE_MARGIN.min, CANDIDATE_MARGIN.max)
    );
    setExtractionFloor(
      clamp(parseNum(String(raw[KEYS.extractionFloor] ?? ""), EXTRACTION.default), EXTRACTION.min, EXTRACTION.max)
    );
  }, [api, supported]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!supported || !api?.getBackendEnvOverrides || !api?.setBackendEnvOverrides) return;
    setBusy(true);
    setStatus(null);
    try {
      const raw = (await api.getBackendEnvOverrides()) as OverridesState;
      const next: Record<string, string | boolean | number> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v === undefined || v === null) continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          next[k] = v;
        }
      }
      if (narrow) next[KEYS.narrow] = true;
      else delete next[KEYS.narrow];
      next[KEYS.narrowMargin] = formatFixed(narrowMargin, 2);
      next[KEYS.margin] = formatFixed(margin, 2);
      next[KEYS.extractionFloor] = formatFixed(extractionFloor, 2);
      const res = await api.setBackendEnvOverrides(next);
      setStatus(res?.ok ? t("advanced.savedOk") : t("advanced.savedWarn"));
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t("advanced.failedSave"));
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!supported || !api?.setBackendEnvOverrides) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.setBackendEnvOverrides({});
      setNarrow(false);
      setNarrowMargin(NARROW_MARGIN.default);
      setMargin(CANDIDATE_MARGIN.default);
      setExtractionFloor(EXTRACTION.default);
      setStatus(t("advanced.cleared"));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t("advanced.failedClear"));
    } finally {
      setBusy(false);
    }
  };

  const narrowMarginPct = useMemo(() => {
    const r = NARROW_MARGIN.max - NARROW_MARGIN.min;
    return r > 0 ? ((narrowMargin - NARROW_MARGIN.min) / r) * 100 : 0;
  }, [narrowMargin]);

  const marginPct = useMemo(() => {
    const r = CANDIDATE_MARGIN.max - CANDIDATE_MARGIN.min;
    return r > 0 ? ((margin - CANDIDATE_MARGIN.min) / r) * 100 : 0;
  }, [margin]);

  const extractionPct = useMemo(() => {
    const r = EXTRACTION.max - EXTRACTION.min;
    return r > 0 ? ((extractionFloor - EXTRACTION.min) / r) * 100 : 0;
  }, [extractionFloor]);

  if (!supported) {
    return (
      <div
        id="sorting-classification"
        data-tour="settings-advanced-classification"
        className="scroll-mt-24 rounded-lg border border-border bg-bg-secondary p-3 text-xs text-muted"
      >
        {t("advanced.desktopOnly")}
      </div>
    );
  }

  return (
    <div
      id="sorting-classification"
      className="scroll-mt-24 space-y-4"
      data-tour="settings-advanced-classification"
    >
      <div data-tour="settings-finetune-intro">
        <label className={SECTION_LABEL_CLASS}>{t("advanced.title")}</label>
        <p className="text-2xs text-muted leading-relaxed mt-1">{t("advanced.intro")}</p>
      </div>

      <label
        className="flex items-start gap-2.5 text-sm text-text-primary cursor-pointer"
        data-tour="settings-finetune-tie-break"
      >
        <input
          type="checkbox"
          className="mt-1 rounded border-border shrink-0"
          checked={narrow}
          onChange={(e) => setNarrow(e.target.checked)}
        />
        <HoverHelpCard hint={t("advanced.tieBreakHint")} className="inline-flex min-w-0">
          <span className="font-medium leading-snug">{t("advanced.tieBreakLabel")}</span>
        </HoverHelpCard>
      </label>

      <div className="space-y-4">
        <div data-tour="settings-finetune-narrow-margin">
          <div className="flex items-center justify-between gap-2 mb-1">
            <HoverHelpCard hint={t("advanced.tieBreakGapHint")} className="inline-block self-start">
              <span className="text-2xs font-medium text-text-primary cursor-help">{t("advanced.tieBreakGapLabel")}</span>
            </HoverHelpCard>
            <span className="text-2xs font-mono tabular-nums text-muted">
              {t("advanced.valueLabel", { value: formatFixed(narrowMargin, 2) })}
            </span>
          </div>
          <input
            type="range"
            min={NARROW_MARGIN.min}
            max={NARROW_MARGIN.max}
            step={NARROW_MARGIN.step}
            value={narrowMargin}
            onChange={(e) => setNarrowMargin(parseFloat(e.target.value))}
            className="w-full h-2 accent-accent"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${narrowMarginPct}%, var(--border) ${narrowMarginPct}%, var(--border) 100%)`,
            }}
          />
          <div className="flex justify-between text-3xs text-muted mt-0.5">
            <span>{t("advanced.tieBreakGapLow")}</span>
            <span>{t("advanced.tieBreakGapHigh")}</span>
          </div>
        </div>

        <div data-tour="settings-finetune-candidate-margin">
          <div className="flex items-center justify-between gap-2 mb-1">
            <HoverHelpCard hint={t("advanced.uncertainGapHint")} className="inline-block self-start">
              <span className="text-2xs font-medium text-text-primary cursor-help">{t("advanced.uncertainGapLabel")}</span>
            </HoverHelpCard>
            <span className="text-2xs font-mono tabular-nums text-muted">
              {t("advanced.valueLabel", { value: formatFixed(margin, 2) })}
            </span>
          </div>
          <input
            type="range"
            min={CANDIDATE_MARGIN.min}
            max={CANDIDATE_MARGIN.max}
            step={CANDIDATE_MARGIN.step}
            value={margin}
            onChange={(e) => setMargin(parseFloat(e.target.value))}
            className="w-full h-2 accent-accent"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${marginPct}%, var(--border) ${marginPct}%, var(--border) 100%)`,
            }}
          />
          <div className="flex justify-between text-3xs text-muted mt-0.5">
            <span>{t("advanced.uncertainGapLow")}</span>
            <span>{t("advanced.uncertainGapHigh")}</span>
          </div>
        </div>

        <div data-tour="settings-finetune-extraction">
          <div className="flex items-center justify-between gap-2 mb-1">
            <HoverHelpCard hint={t("advanced.qualityHint")} className="inline-block self-start">
              <span className="text-2xs font-medium text-text-primary cursor-help">{t("advanced.qualityLabel")}</span>
            </HoverHelpCard>
            <span className="text-2xs font-mono tabular-nums text-muted">
              {t("advanced.valueLabel", { value: formatFixed(extractionFloor, 2) })}
            </span>
          </div>
          <input
            type="range"
            min={EXTRACTION.min}
            max={EXTRACTION.max}
            step={EXTRACTION.step}
            value={extractionFloor}
            onChange={(e) => setExtractionFloor(parseFloat(e.target.value))}
            className="w-full h-2 accent-accent"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${extractionPct}%, var(--border) ${extractionPct}%, var(--border) 100%)`,
            }}
          />
          <div className="flex justify-between text-3xs text-muted mt-0.5">
            <span>{t("advanced.qualityLow")}</span>
            <span>{t("advanced.qualityHigh")}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          title={t("advanced.saveHelp")}
          className="rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          onClick={() => void save()}
        >
          {t("advanced.save")}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary disabled:opacity-50"
          onClick={() => void clearAll()}
        >
          {t("advanced.clear")}
        </button>
      </div>
      {status && <p className="text-3xs text-muted">{status}</p>}
    </div>
  );
}
