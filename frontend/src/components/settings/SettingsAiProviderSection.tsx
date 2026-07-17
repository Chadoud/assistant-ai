/**
 * SettingsAiProviderSection — configure Gemini (voice + chat) and optional backup providers.
 *
 * Gemini is the primary provider for voice and text chat. OpenAI, Anthropic, and Custom
 * are optional backup keys for reasoning, vision failover, and orchestrator relays — saving
 * a key enables them automatically; they are not manually "activated" as chat providers.
 *
 * Keys are stored locally in AppSettings AND pushed to the backend via POST /ai/set-key
 * so background/voice paths can read them from the environment.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AppSettings, ChatProviderConfig, ChatProviderId } from "../../types/settings";
import { desktopClient } from "../../desktopClient";
import { GEMINI_AI_STUDIO_API_KEY_URL } from "../../constants";
import { useI18n } from "../../i18n/I18nContext";
import {
  isGeminiConnectedInSettings,
  isProviderApiKeyPresent,
  resolveProviderApiKeyForPresence,
} from "../../utils/geminiConnection";
import { ensureVoiceBackendReady } from "../../voice/ensureVoiceBackendReady";
import { pushProviderKeyToBackend } from "../../utils/syncGeminiKeyToBackend";
import ModalShell from "../ModalShell";
import SelectDropdown, {
  SELECT_DROPDOWN_PANEL_CLASS,
  selectDropdownPlainOptionClassName,
} from "../ui/SelectDropdown";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "../../utils/styles";

interface Props {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  backendOnline: boolean;
  /** Opens the guided Gemini key modal (same as chat prerequisite). */
  onOpenGeminiSetup?: () => void;
  cloudSortActive?: boolean;
}

interface ProviderStatus {
  ready: boolean;
  is_local: boolean;
  default_models: string[];
}

interface AiStatus {
  providers?: Record<string, ProviderStatus>;
}

type SyncState = "idle" | "saving" | "saved" | "error";

interface ProviderUi {
  id: ChatProviderId;
  icon: string;
  brand: string;
  defaultModels: string[];
  keyUrl?: string;
  keyPlaceholder?: string;
  baseUrlPlaceholder?: string;
}

const PROVIDERS: ProviderUi[] = [
  {
    id: "gemini",
    icon: "✦",
    brand: "Gemini",
    defaultModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    keyUrl: GEMINI_AI_STUDIO_API_KEY_URL,
    keyPlaceholder: "AIza… or AQ.…",
  },
  {
    id: "openai",
    icon: "◎",
    brand: "OpenAI",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o4-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
  },
  {
    id: "anthropic",
    icon: "✶",
    brand: "Anthropic",
    defaultModels: [
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-haiku-4-5-20251001",
      "claude-fable-5",
      "claude-sonnet-4-6",
      "claude-opus-4-7",
    ],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "custom",
    icon: "🔌",
    brand: "Custom",
    defaultModels: [],
    keyPlaceholder: "sk-...",
    baseUrlPlaceholder: "https://api.example.com/v1",
  },
];

const PROVIDER_BY_ID: Partial<Record<ChatProviderId, ProviderUi>> = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.id, provider]),
);

/** Backup keys only — never become the primary chat provider from this UI. */
const BACKUP_PROVIDER_IDS: ReadonlySet<ChatProviderId> = new Set(["openai", "anthropic", "custom"]);

function isBackupProvider(id: ChatProviderId): boolean {
  return BACKUP_PROVIDER_IDS.has(id);
}

interface ProviderSectionConfig {
  id: "gemini" | "altChat";
  titleKey: string;
  descKey: string;
  providerIds: ChatProviderId[];
  layout: "single" | "grid";
}

const PROVIDER_SECTIONS: ProviderSectionConfig[] = [
  {
    id: "gemini",
    titleKey: "settings.aiProviders.sections.geminiTitle",
    descKey: "settings.aiProviders.sections.geminiDesc",
    providerIds: ["gemini"],
    layout: "single",
  },
  {
    id: "altChat",
    titleKey: "settings.aiProviders.sections.altChatTitle",
    descKey: "settings.aiProviders.sections.altChatDesc",
    providerIds: ["openai", "anthropic", "custom"],
    layout: "grid",
  },
];

interface ProviderCardProps {
  ui: ProviderUi;
  active: boolean;
  ready: boolean;
  blurb: string;
  cardActionLabel: string;
  onCardClick: () => void;
  onActionClick: () => void;
  t: (key: string) => string;
}

function ProviderCard({
  ui,
  active,
  ready,
  blurb,
  cardActionLabel,
  onCardClick,
  onActionClick,
  t,
}: ProviderCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCardClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCardClick}
      onKeyDown={handleKeyDown}
      aria-label={`${ui.brand} — ${cardActionLabel}`}
      aria-pressed={active}
      className={`relative flex w-full cursor-pointer flex-col rounded-xl border p-4 text-left transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary ${
        active
          ? "border-accent bg-accent-soft ring-1 ring-accent"
          : "border-border bg-bg-secondary hover:border-border-soft hover:bg-hover-overlay"
      }`}
    >
      {active ? (
        <span className="absolute right-3 top-3 rounded-full bg-button-primary px-2 py-0.5 text-2xs font-semibold text-white">
          {t("settings.aiProviders.active")}
        </span>
      ) : null}

      <div className={`flex items-start gap-2 ${active ? "pr-16" : ""}`}>
        <span className="shrink-0 text-base leading-none pt-0.5">{ui.icon}</span>
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <div>
            <span className="font-semibold text-sm text-text-primary">{ui.brand}</span>
            <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">{blurb}</p>
          </div>

          <div className="flex items-end justify-between gap-2">
            <span className="flex items-center gap-1.5 text-2xs">
              {ready ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t("settings.aiProviders.configured")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {t("settings.aiProviders.keyNeeded")}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onActionClick();
              }}
              className="shrink-0 text-2xs font-medium text-accent hover:underline"
            >
              {cardActionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderSection({
  section,
  children,
  t,
}: {
  section: ProviderSectionConfig;
  children: ReactNode;
  t: (key: string) => string;
}) {
  const isPrimary = section.id === "gemini";

  return (
    <section aria-labelledby={isPrimary ? undefined : `provider-section-${section.id}`} className="space-y-3">
      {isPrimary ? (
        <p className="text-xs text-muted leading-relaxed max-w-prose">{t(section.descKey)}</p>
      ) : (
        <div>
          <h4 id={`provider-section-${section.id}`} className="text-sm font-semibold text-text-primary">
            {t(section.titleKey)}
          </h4>
          <p className="mt-1 text-xs text-muted leading-relaxed max-w-prose">{t(section.descKey)}</p>
        </div>
      )}
      {children}
    </section>
  );
}

export default function SettingsAiProviderSection({
  settings,
  onSettingsPatch,
  backendOnline,
  onOpenGeminiSetup,
  cloudSortActive = false,
}: Props) {
  const { t } = useI18n();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [modalProvider, setModalProvider] = useState<ProviderUi | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);

  const modelOptionsFor = useCallback(
    (ui: ProviderUi, currentModel: string): string[] => {
      const fromStatus = status?.providers?.[ui.id]?.default_models;
      const base = fromStatus?.length ? fromStatus : ui.defaultModels;
      const trimmed = currentModel.trim();
      if (trimmed && !base.includes(trimmed)) {
        return [trimmed, ...base];
      }
      return base;
    },
    [status],
  );

  const modalModelOptions = useMemo(() => {
    if (!modalProvider) return [];
    return modelOptionsFor(modalProvider, draftModel);
  }, [modalProvider, draftModel, modelOptionsFor]);

  useEffect(() => {
    setModelDropdownOpen(false);
  }, [modalProvider?.id]);

  // Fetch live AI status (refresh after a save updates the ready badges).
  useEffect(() => {
    if (!backendOnline) return;
    let cancelled = false;
    void (async () => {
      try {
        const d = await desktopClient.getAiStatus();
        if (cancelled) return;
        setStatus(d && typeof d === "object" ? (d as AiStatus) : null);
      } catch {
        if (!cancelled) setStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendOnline, syncState]);

  // Voice and other backend paths read GEMINI_API_KEY from the process env — sync whenever connected
  // (including packaged safeStorage mask; spawn may already have injected the real key).
  // Key-field deps only: unrelated settings patches must not re-arm the timer. Latest settings
  // are read via ref so ensureVoiceBackendReady always sees current chatProviders / models.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const geminiApiKey = settings.geminiApiKey;
  const geminiProviderApiKey = settings.chatProviders?.gemini?.apiKey;
  useEffect(() => {
    const latest = settingsRef.current;
    if (!backendOnline || !isGeminiConnectedInSettings(latest)) return;
    const handle = window.setTimeout(() => {
      void ensureVoiceBackendReady(settingsRef.current, { backendOnline }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(handle);
  }, [backendOnline, geminiApiKey, geminiProviderApiKey]);

  const defaultModelFor = useCallback(
    (ui: ProviderUi): string => {
      const fromStatus = status?.providers?.[ui.id]?.default_models;
      if (fromStatus && fromStatus.length) return fromStatus[0];
      return ui.defaultModels[0] ?? "";
    },
    [status],
  );

  const isReady = useCallback(
    (ui: ProviderUi): boolean => {
      if (ui.id === "ollama") return true;
      // Gemini: same check as chat/voice readiness (includes packaged safeStorage mask).
      if (ui.id === "gemini") return isGeminiConnectedInSettings(settings);
      if (isProviderApiKeyPresent(resolveProviderApiKeyForPresence(settings, ui.id))) {
        return true;
      }
      return status?.providers?.[ui.id]?.ready ?? false;
    },
    [settings, status],
  );

  const openConfig = useCallback(
    (ui: ProviderUi) => {
      const cfg = settings.chatProviders?.[ui.id];
      setDraftKey(cfg?.apiKey ?? (ui.id === "gemini" ? settings.geminiApiKey : "") ?? "");
      setDraftBaseUrl(cfg?.baseUrl ?? "");
      setDraftModel(cfg?.model || defaultModelFor(ui));
      setKeyVisible(false);
      setSyncState("idle");
      setModalProvider(ui);
    },
    [settings.chatProviders, settings.geminiApiKey, defaultModelFor],
  );

  const saveConfig = useCallback(async () => {
    const ui = modalProvider;
    if (!ui) return;
    const apiKey = draftKey.trim();
    const baseUrl = draftBaseUrl.trim();
    const model = draftModel.trim() || defaultModelFor(ui);

    const cfg: ChatProviderConfig = { apiKey, baseUrl: baseUrl || undefined, model };
    const patch: Partial<AppSettings> = {
      chatProviders: { ...(settings.chatProviders ?? {}), [ui.id]: cfg },
    };
    if (ui.id === "gemini") {
      patch.geminiApiKey = apiKey;
      patch.aiProvider = "gemini";
      patch.chatModel = model;
    }
    onSettingsPatch(patch);

    if (backendOnline && (apiKey || ui.id === "custom")) {
      setSyncState("saving");
      try {
        await pushProviderKeyToBackend(ui.id, apiKey, baseUrl);
        setSyncState("saved");
        setModalProvider(null);
      } catch {
        setSyncState("error");
      }
    } else {
      setModalProvider(null);
    }
  }, [modalProvider, draftKey, draftBaseUrl, draftModel, defaultModelFor, settings.chatProviders, backendOnline, onSettingsPatch]);

  const blurb = (id: ChatProviderId): string => t(`settings.aiProviders.providerBlurb.${id}`);

  const openProviderSetup = useCallback(
    (ui: ProviderUi) => {
      if (ui.id === "gemini" && onOpenGeminiSetup) {
        onOpenGeminiSetup();
        return;
      }
      openConfig(ui);
    },
    [onOpenGeminiSetup, openConfig],
  );

  const showActiveBadge = useCallback(
    (ui: ProviderUi, ready: boolean): boolean => {
      if (isBackupProvider(ui.id)) return false;
      return ui.id === "gemini" && ready;
    },
    [],
  );

  const renderProviderCard = useCallback(
    (ui: ProviderUi) => {
      const ready = isReady(ui);
      const active = showActiveBadge(ui, ready);

      return (
        <ProviderCard
          key={ui.id}
          ui={ui}
          active={active}
          ready={ready}
          blurb={blurb(ui.id)}
          cardActionLabel={t("settings.aiProviders.configure")}
          onCardClick={() => openProviderSetup(ui)}
          onActionClick={() => openProviderSetup(ui)}
          t={t}
        />
      );
    },
    [isReady, blurb, openProviderSetup, showActiveBadge, t],
  );

  return (
    <>
      {!isGeminiConnectedInSettings(settings) && onOpenGeminiSetup ? (
        <div
          className="mb-4 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 space-y-2"
          role="status"
        >
          <p className="text-sm font-medium text-text-primary">{t("settings.geminiRequiredTitle")}</p>
          <p className="text-xs text-muted leading-relaxed">
            {t(cloudSortActive ? "settings.geminiRequiredHintCloud" : "settings.geminiRequiredHint")}
          </p>
          <button
            type="button"
            onClick={onOpenGeminiSetup}
            className="text-sm font-medium text-accent hover:underline"
          >
            {t("settings.geminiRequiredCta")}
          </button>
        </div>
      ) : null}
      <div className="space-y-8">
        {PROVIDER_SECTIONS.map((section) => (
          <ProviderSection key={section.id} section={section} t={t}>
            <div
              className={
                section.layout === "single"
                  ? "max-w-md"
                  : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
              }
            >
              {section.providerIds.map((providerId) => {
                const ui = PROVIDER_BY_ID[providerId];
                if (!ui) return null;
                return renderProviderCard(ui);
              })}
            </div>
          </ProviderSection>
        ))}
      </div>

      {modalProvider && (
        <ModalShell
          title={`${modalProvider.brand} — ${t("settings.aiProviders.configure")}`}
          onClose={() => setModalProvider(null)}
          maxWidthClass="max-w-lg"
        >
          <div className="space-y-4 pb-1">
            {modalProvider.baseUrlPlaceholder && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-text-secondary">
                  {t("settings.aiProviders.baseUrl")}
                </span>
                <input
                  type="text"
                  value={draftBaseUrl}
                  onChange={(e) => setDraftBaseUrl(e.target.value)}
                  placeholder={modalProvider.baseUrlPlaceholder}
                  autoComplete="off"
                  className="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                />
                <span className="text-2xs text-muted">{t("settings.aiProviders.baseUrlHint")}</span>
              </label>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">
                {t("settings.aiProviders.apiKey")}
              </span>
              <div className="flex gap-2">
                <input
                  type={keyVisible ? "text" : "password"}
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  placeholder={modalProvider.keyPlaceholder}
                  autoComplete="off"
                  autoFocus
                  className="flex-1 rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                />
                <button
                  type="button"
                  onClick={() => setKeyVisible((v) => !v)}
                  className="rounded-xl border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary hover:bg-hover-overlay"
                >
                  {keyVisible ? t("settings.aiProviders.hide") : t("settings.aiProviders.show")}
                </button>
              </div>
              <span className="text-2xs text-muted">
                {t("settings.aiProviders.apiKeyHint")}
                {modalProvider.keyUrl && (
                  <>
                    {" "}
                    <a
                      href={modalProvider.keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {t("settings.aiProviders.getKey")}
                    </a>
                  </>
                )}
              </span>
            </label>

            <div className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">
                {t("settings.aiProviders.model")}
              </span>
              {modalProvider.id === "custom" || modalModelOptions.length === 0 ? (
                <input
                  type="text"
                  value={draftModel}
                  onChange={(e) => setDraftModel(e.target.value)}
                  placeholder={t("settings.aiProviders.modelPlaceholder")}
                  autoComplete="off"
                  className="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                />
              ) : (
                <SelectDropdown
                  open={modelDropdownOpen}
                  onOpenChange={setModelDropdownOpen}
                  triggerRef={modelTriggerRef}
                  triggerId={`settings-ai-model-${modalProvider.id}`}
                  triggerLabel={
                    draftModel.trim() ? (
                      <span className="font-mono truncate">{draftModel}</span>
                    ) : (
                      <span className="text-muted">{t("settings.aiProviders.modelPlaceholder")}</span>
                    )
                  }
                  ariaLabel={t("settings.aiProviders.model")}
                  triggerClassName="!rounded-xl !px-3 !py-2 font-mono"
                  portaled
                >
                  <div
                    role="listbox"
                    aria-label={t("settings.aiProviders.model")}
                    className={`${SELECT_DROPDOWN_PANEL_CLASS} max-h-60 overflow-y-auto`}
                  >
                    {modalModelOptions.map((modelId) => (
                      <button
                        key={modelId}
                        type="button"
                        role="option"
                        aria-selected={draftModel === modelId}
                        onClick={() => {
                          setDraftModel(modelId);
                          setModelDropdownOpen(false);
                          modelTriggerRef.current?.focus();
                        }}
                        className={`${selectDropdownPlainOptionClassName(draftModel === modelId)} font-mono`}
                      >
                        {modelId}
                      </button>
                    ))}
                  </div>
                </SelectDropdown>
              )}
              <span className="text-2xs text-muted">{t("settings.aiProviders.modelHint")}</span>
            </div>

            {syncState === "saving" && (
              <p className="text-2xs text-muted animate-pulse">{t("settings.aiProviders.saving")}</p>
            )}
            {syncState === "saved" && (
              <p className="text-2xs text-emerald-400">✓ {t("settings.aiProviders.saved")}</p>
            )}
            {syncState === "error" && (
              <p className="text-2xs text-red-400">⚠ {t("settings.aiProviders.saveError")}</p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setModalProvider(null)}
                className={SECONDARY_BTN_CLASS}
              >
                {t("settings.models.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void saveConfig()}
                disabled={syncState === "saving"}
                className={PRIMARY_BTN_CLASS}
              >
                {syncState === "saving" ? t("settings.aiProviders.saving") : t("settings.aiProviders.configure")}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
