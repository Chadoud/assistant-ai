import { useCallback, useEffect, useState } from "react";
import { desktopClient } from "../../desktopClient";
import HoverHelpCard from "../ui/HoverHelpCard";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS, SECTION_LABEL_CLASS } from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";

const KEYS = {
  mode: "OLLAMA_MODE",
  host: "OLLAMA_HOST",
  apiKey: "OLLAMA_API_KEY",
  remoteFlag: "EXOSITES_REMOTE_LLM",
  maxSlots: "EXOSITES_LLM_MAX_SLOTS",
} as const;

type OverridesState = Partial<Record<string, string | boolean | number>>;

type ReadyOllamaCheck = {
  ok?: boolean;
  mode?: string;
  detail?: string;
};

type ReadyLlmAdmission = {
  remote?: boolean;
  sort_max_concurrency_effective?: number;
  llm_max_slots?: number;
};

/**
 * Dev-only controls for the Exo cloud LLM gateway (LiteLLM on VPS).
 * Local ``ollama serve`` is not supported — see docs/CLOUD_LLM_ONLY.md.
 */
export default function RemoteLlmSection({ backendOnline }: { backendOnline: boolean }) {
  const { t } = useI18n();
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  const supported = Boolean(api?.getBackendEnvOverrides && api?.setBackendEnvOverrides);

  const [host, setHost] = useState("https://llm-staging.exosites.ch");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [maxSlots, setMaxSlots] = useState("2");
  const [status, setStatus] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    if (!supported || !api?.getBackendEnvOverrides) return;
    const raw = (await api.getBackendEnvOverrides()) as OverridesState;
    const h = String(raw[KEYS.host] ?? "").trim();
    if (h) setHost(h);
    const configured =
      raw[`${KEYS.apiKey}_configured`] === true || raw[`${KEYS.apiKey}_configured`] === "1";
    setApiKeyConfigured(configured);
    setApiKey(configured ? "" : String(raw[KEYS.apiKey] ?? ""));
    const slots = String(raw[KEYS.maxSlots] ?? "").trim();
    if (slots) setMaxSlots(slots);
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
      next[KEYS.mode] = "remote";
      next[KEYS.remoteFlag] = "1";
      next[KEYS.host] = host.trim();
      if (apiKey.trim()) next[KEYS.apiKey] = apiKey.trim();
      next[KEYS.maxSlots] = maxSlots.trim() || "2";
      const res = await api.setBackendEnvOverrides(next);
      setStatus(res?.ok ? t("remoteLlm.savedOk") : t("remoteLlm.savedWarn"));
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t("remoteLlm.failedSave"));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    if (!backendOnline) {
      setTestStatus(t("remoteLlm.backendOffline"));
      return;
    }
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await desktopClient.fetch("/ready");
      const body = (await res.json()) as {
        checks?: { ollama?: ReadyOllamaCheck; llm_admission?: ReadyLlmAdmission };
      };
      const ollama = body.checks?.ollama;
      const admission = body.checks?.llm_admission;
      if (ollama?.ok) {
        const slots = admission?.sort_max_concurrency_effective;
        setTestStatus(
          slots && slots > 0
            ? t("remoteLlm.testOkSlots", { mode: ollama.mode ?? "unknown", slots })
            : t("remoteLlm.testOk", { mode: ollama.mode ?? "unknown" })
        );
      } else {
        setTestStatus(
          t("remoteLlm.testFail", { detail: ollama?.detail ?? `HTTP ${res.status}` })
        );
      }
    } catch (e) {
      setTestStatus(e instanceof Error ? e.message : t("remoteLlm.testFailGeneric"));
    } finally {
      setTesting(false);
    }
  };

  if (!supported) {
    return (
      <p className="text-xs text-muted">{t("remoteLlm.desktopOnly")}</p>
    );
  }

  return (
    <div
      className="rounded-lg border border-border bg-bg-secondary p-4 space-y-4"
      data-tour="settings-remote-llm"
    >
      <HoverHelpCard hint={t("remoteLlm.hint")}>
        <h4 className={SECTION_LABEL_CLASS}>{t("remoteLlm.title")}</h4>
      </HoverHelpCard>
      <p className="text-xs text-text-secondary leading-relaxed">{t("remoteLlm.desc")}</p>
      <p className="text-2xs text-muted">{t("remoteLlm.cloudOnlyNote")}</p>

      <div className="space-y-3">
        <label className="block text-xs">
          <span className="text-text-secondary">{t("remoteLlm.hostLabel")}</span>
          <input
            type="url"
            className="mt-1 w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="https://llm-staging.exosites.ch"
          />
        </label>
        <label className="block text-xs">
          <span className="text-text-secondary">{t("remoteLlm.apiKeyLabel")}</span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm font-mono"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeyConfigured ? t("remoteLlm.apiKeyConfiguredPlaceholder") : undefined}
          />
        </label>
        <label className="block text-xs">
          <span className="text-text-secondary">{t("remoteLlm.maxSlotsLabel")}</span>
          <input
            type="number"
            min={1}
            max={4}
            className="mt-1 w-24 rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            value={maxSlots}
            onChange={(e) => setMaxSlots(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className={PRIMARY_BTN_CLASS} disabled={busy} onClick={() => void save()}>
          {busy ? t("remoteLlm.saving") : t("remoteLlm.save")}
        </button>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={testing}
          onClick={() => void testConnection()}
        >
          {testing ? t("remoteLlm.testing") : t("remoteLlm.test")}
        </button>
        {status ? <span className="text-xs text-text-secondary">{status}</span> : null}
        {testStatus ? <span className="text-xs text-text-secondary">{testStatus}</span> : null}
      </div>
    </div>
  );
}
