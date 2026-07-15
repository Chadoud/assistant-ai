/**
 * Pure helpers for merging persisted app settings with the current state.
 *
 * Keeping this separate from the React hook allows unit-testing edge cases
 * (unknown presets, malformed ocrLanguages, legal-terms version guards) without
 * mounting a component or touching localStorage.
 */

import { LEGAL_TERMS_BUNDLE_VERSION } from "../constants";
import type { AppSettings, ChatProviderConfig } from "../types/settings";
import type { PushToTalkShortcut } from "../types/voiceInteraction";
import { ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED } from "../systemCommands/assistantToolCatalogUi";
import { isSystemCommandIdV1, type SystemCommandIdV1 } from "../systemCommands/catalog";
import { DEFAULT_OCR_TESSERACT_LANGUAGE_CODES } from "../utils/tesseractLangCatalog";
import { parseUiLocale } from "../i18n/locale";
import { defaultPushToTalkShortcut } from "../types/voiceInteraction";
import { DEFAULT_CUSTOM_MIN_CONFIDENCE, isAutomationPreset } from "../utils/automationPreset";
import { DEFAULT_SORT_STRUCTURE_TEMPLATE } from "../types/sortStructure";
import { parseSortStructureTemplate } from "../utils/sortStructureHydration";
import { inferSortClassifyModeFromLegacy } from "../utils/inferSortClassifyMode";

// ── Default settings ──────────────────────────────────────────────────────────

export const DEFAULT_APP_SETTINGS: AppSettings = {
  /** Empty until the user picks a model (setup wizard or Settings); avoids skipping the welcome flow. */
  model: "",
  /** Empty until the user configures their chat AI; defaults to gemini-2.5-flash when aiProvider is "gemini". */
  chatModel: "",
  uiLocale: "en",
  outputDir: "",
  mode: "copy",
  language: "English",
  folderViewMode: "rows",
  visionModel: "",
  rules: [],
  onCollision: "uniquify",
  minConfidence: null,
  automationPreset: "balanced",
  ocrLanguages: [...DEFAULT_OCR_TESSERACT_LANGUAGE_CODES],
  /**
   * Diagnostics (usage + crashes) are on by default (legitimate interest; see Privacy Policy).
   * Users may object in Settings → Privacy; persisted opt-out is honored on hydration.
   */
  telemetryOptIn: true,
  crashReportsOptIn: true,
  /** @deprecated Legacy flag; use telemetryOptIn / crashReportsOptIn objection toggles. */
  diagnosticsOptOutExplicit: false,
  acceptedLegalTermsVersion: null,
  sortSystemPrompt: "",
  sortStructureTemplate: { ...DEFAULT_SORT_STRUCTURE_TEMPLATE },
  sortClassifyMode: "builtin",
  documentBriefingEnable: null,
  assistantToolsEnabled: false,
  assistantToolsReadEnabled: true,
  assistantToolsWriteEnabled: false,
  assistantToolsProviderMicrosoft: true,
  assistantToolsProviderGoogle: true,
  assistantToolsProviderInfomaniak: true,
  assistantToolsFollowUpEnabled: true,
  assistantInstalledToolIds: null,
  assistantMemoryEnabled: true,
  brainMapIncludeMailTasks: false,
  assistantAgentEnabled: true,
  autonomousMode: false,
  chatWebSearchEnabled: false,
  aiProvider: "ollama",
  geminiApiKey: "",
  chatProviders: {},
  voiceAutoStart: false,
  voiceInteractionMode: "conversation",
  pttShortcut: defaultPushToTalkShortcut(),
  pttDoubleTapForLockedMode: true,
  pttSoundsEnabled: false,
  pttShowOverlay: true,
  pttGlobalWhenAppInBackground: true,
  /** Opt-in: double-clap to focus the app while it is running (and at login if enabled). */
  clapToLaunchEnabled: false,
  voiceToolsAlwaysApproved: [],
  assistantDebugUiEnabled: true,
};

/** Provider ids accepted for the active chat provider. */
const CHAT_PROVIDER_IDS = new Set<AppSettings["aiProvider"]>([
  "ollama",
  "gemini",
  "openai",
  "anthropic",
  "custom",
]);

// ── Hydration ─────────────────────────────────────────────────────────────────

/** Raw parsed shape — localStorage may have the legacy `ocrLanguage` string field. */
type PersistedSettings = Partial<AppSettings> & { ocrLanguage?: string };

/**
 * Merge a raw parsed localStorage value with the current settings state.
 *
 * Each field is validated individually so that a single malformed key never
 * corrupts the rest. Unknown or invalid values fall back to `prev`.
 *
 * @param parsed - The raw `JSON.parse` result from localStorage (untrusted).
 * @param prev   - The current in-memory settings state (always valid).
 */
export function mergeAppSettings(parsed: PersistedSettings, prev: AppSettings): AppSettings {
  const automationPreset = isAutomationPreset(parsed.automationPreset)
    ? parsed.automationPreset
    : "custom";

  const minConfidenceUnknown =
    parsed.minConfidence === null || parsed.minConfidence === undefined;
  const minConfidence =
    automationPreset === "custom" &&
    !isAutomationPreset(parsed.automationPreset) &&
    minConfidenceUnknown
      ? DEFAULT_CUSTOM_MIN_CONFIDENCE
      : minConfidenceUnknown
        ? null
        : typeof parsed.minConfidence === "number" &&
            parsed.minConfidence >= 0 &&
            parsed.minConfidence <= 1
          ? parsed.minConfidence
          : prev.minConfidence;

  const assistantInstalledToolIds = (() => {
    const v = (parsed as { assistantInstalledToolIds?: unknown }).assistantInstalledToolIds;
    if (v === undefined) return prev.assistantInstalledToolIds;
    if (v === null) return null;
    if (!Array.isArray(v)) return prev.assistantInstalledToolIds;
    const allowed = new Set(ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED);
    const valid = v.filter((x): x is SystemCommandIdV1 => typeof x === "string" && isSystemCommandIdV1(x));
    const filtered = valid.filter((id) => allowed.has(id));
    const ordered = ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED.filter((id) => filtered.includes(id));
    // All tools enabled = canonical null (no explicit subset)
    return ordered.length === ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED.length ? null : ordered;
  })();

  function parseBool(key: keyof AppSettings, fallback: boolean): boolean {
    const v = (parsed as Record<string, unknown>)[key as string];
    return typeof v === "boolean" ? v : fallback;
  }

  // ── Resolve aiProvider, chatModel, and model (sort) independently ────────────
  //
  // chatModel  → text chat + voice (Gemini slug or Ollama tag depending on aiProvider)
  // model      → Ollama sort/classify pipeline only (always an Ollama tag)
  //
  // Migration: if chatModel is not set yet but the stored model looks like a Gemini
  // slug, it was previously used as the chat model — move it to chatModel and clear
  // model so the user is prompted to pick a proper Ollama sort model.
  const GEMINI_CHAT_MODEL_DEFAULT = "gemini-2.5-flash";
  const isGeminiSlug = (s: string) => s.startsWith("gemini-") || s.startsWith("models/gemini");

  const resolvedProvider: AppSettings["aiProvider"] = (() => {
    const v = (parsed as { aiProvider?: unknown }).aiProvider;
    return typeof v === "string" && CHAT_PROVIDER_IDS.has(v as AppSettings["aiProvider"])
      ? (v as AppSettings["aiProvider"])
      : prev.aiProvider;
  })();

  const rawModel = typeof parsed.model === "string" ? parsed.model : prev.model;
  const rawChatModel = typeof (parsed as { chatModel?: unknown }).chatModel === "string"
    ? (parsed as { chatModel: string }).chatModel
    : prev.chatModel;

  // Migrate: if chatModel is unset and the sort model field contains a Gemini slug,
  // promote it to chatModel and clear the sort model.
  const migratedFromModel = !rawChatModel && isGeminiSlug(rawModel);

  const resolvedChatModel: string = (() => {
    const baseSource = migratedFromModel ? rawModel : rawChatModel;
    const base = typeof baseSource === "string" ? baseSource.trim() : "";

    if (resolvedProvider === "ollama") {
      if (!base) return "";
      // Never send Gemini cloud slugs to Ollama (404 / model not found).
      if (isGeminiSlug(base)) return "";
      return base;
    }

    if (resolvedProvider === "gemini") {
      if (!base) return GEMINI_CHAT_MODEL_DEFAULT;
      if (isGeminiSlug(base)) return base;
      // Stored Ollama tag while provider is Gemini — use default so chat works.
      return GEMINI_CHAT_MODEL_DEFAULT;
    }

    // openai / anthropic / custom: trust the stored chat model (set by the provider UI).
    return base;
  })();

  const resolvedModel: string = migratedFromModel ? "" : rawModel;

  const resolvedGeminiApiKey: string = (() => {
    const v = (parsed as { geminiApiKey?: unknown }).geminiApiKey;
    return typeof v === "string" ? v : prev.geminiApiKey;
  })();

  // Per-provider config map, validated entry by entry. On first hydration with the
  // new schema, seed from prev; always migrate the legacy geminiApiKey into it.
  const resolvedChatProviders: Record<string, ChatProviderConfig> = (() => {
    const raw = (parsed as { chatProviders?: unknown }).chatProviders;
    const out: Record<string, ChatProviderConfig> = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [pid, cfg] of Object.entries(raw as Record<string, unknown>)) {
        if (!CHAT_PROVIDER_IDS.has(pid as AppSettings["aiProvider"])) continue;
        if (!cfg || typeof cfg !== "object") continue;
        const c = cfg as Record<string, unknown>;
        out[pid] = {
          apiKey: typeof c.apiKey === "string" ? c.apiKey : "",
          baseUrl: typeof c.baseUrl === "string" ? c.baseUrl : undefined,
          model: typeof c.model === "string" ? c.model : "",
        };
      }
    } else {
      Object.assign(out, prev.chatProviders ?? {});
    }
    if (resolvedGeminiApiKey && !out.gemini?.apiKey) {
      out.gemini = {
        apiKey: resolvedGeminiApiKey,
        baseUrl: out.gemini?.baseUrl,
        model:
          out.gemini?.model ||
          (isGeminiSlug(resolvedChatModel) ? resolvedChatModel : GEMINI_CHAT_MODEL_DEFAULT),
      };
    }
    return out;
  })();

  return {
    model: resolvedModel,
    chatModel: resolvedChatModel,
    uiLocale: parseUiLocale((parsed as { uiLocale?: string }).uiLocale ?? prev.uiLocale),
    outputDir: typeof parsed.outputDir === "string" ? parsed.outputDir : prev.outputDir,
    mode: parsed.mode === "copy" || parsed.mode === "move" ? parsed.mode : prev.mode,
    language: typeof parsed.language === "string" ? parsed.language : prev.language,
    folderViewMode:
      parsed.folderViewMode === "rows" || parsed.folderViewMode === "grid"
        ? parsed.folderViewMode
        : prev.folderViewMode,
    visionModel: typeof parsed.visionModel === "string" ? parsed.visionModel : prev.visionModel,
    rules: Array.isArray(parsed.rules) ? (parsed.rules as AppSettings["rules"]) : prev.rules,
    onCollision:
      parsed.onCollision === "uniquify" || parsed.onCollision === "error"
        ? parsed.onCollision
        : prev.onCollision,
    minConfidence,
    automationPreset,
    ocrLanguages: Array.isArray(parsed.ocrLanguages)
      ? (parsed.ocrLanguages as unknown[]).filter((x): x is string => typeof x === "string")
      : typeof parsed.ocrLanguage === "string" && parsed.ocrLanguage.trim()
        ? parsed.ocrLanguage.split("+").map((s) => s.trim()).filter(Boolean)
        : prev.ocrLanguages,
    telemetryOptIn: parseBool("telemetryOptIn", DEFAULT_APP_SETTINGS.telemetryOptIn),
    crashReportsOptIn: parseBool("crashReportsOptIn", DEFAULT_APP_SETTINGS.crashReportsOptIn),
    diagnosticsOptOutExplicit: false,
    acceptedLegalTermsVersion: (() => {
      const v = (parsed as { acceptedLegalTermsVersion?: unknown }).acceptedLegalTermsVersion;
      return typeof v === "string" && v === LEGAL_TERMS_BUNDLE_VERSION
        ? LEGAL_TERMS_BUNDLE_VERSION
        : null;
    })(),
    sortSystemPrompt:
      typeof (parsed as { sortSystemPrompt?: string }).sortSystemPrompt === "string"
        ? (parsed as { sortSystemPrompt: string }).sortSystemPrompt
        : prev.sortSystemPrompt,
    sortStructureTemplate: (() => {
      const raw = (parsed as { sortStructureTemplate?: unknown }).sortStructureTemplate;
      return parseSortStructureTemplate(raw) ?? prev.sortStructureTemplate ?? { ...DEFAULT_SORT_STRUCTURE_TEMPLATE };
    })(),
    sortClassifyMode: (() => {
      const raw = (parsed as { sortClassifyMode?: unknown }).sortClassifyMode;
      if (raw === "builtin" || raw === "structure" || raw === "custom") return raw;
      const prompt =
        typeof (parsed as { sortSystemPrompt?: string }).sortSystemPrompt === "string"
          ? (parsed as { sortSystemPrompt: string }).sortSystemPrompt
          : prev.sortSystemPrompt;
      const tplRaw = (parsed as { sortStructureTemplate?: unknown }).sortStructureTemplate;
      const tpl =
        parseSortStructureTemplate(tplRaw) ?? prev.sortStructureTemplate ?? { ...DEFAULT_SORT_STRUCTURE_TEMPLATE };
      return inferSortClassifyModeFromLegacy(prompt, tpl);
    })(),
    documentBriefingEnable: (() => {
      const v = (parsed as { documentBriefingEnable?: unknown }).documentBriefingEnable;
      if (v === null || v === undefined) return prev.documentBriefingEnable;
      return typeof v === "boolean" ? v : prev.documentBriefingEnable;
    })(),
    assistantToolsEnabled: parseBool("assistantToolsEnabled", prev.assistantToolsEnabled),
    assistantToolsReadEnabled: parseBool("assistantToolsReadEnabled", prev.assistantToolsReadEnabled),
    assistantToolsWriteEnabled: parseBool("assistantToolsWriteEnabled", prev.assistantToolsWriteEnabled),
    assistantToolsProviderMicrosoft: parseBool("assistantToolsProviderMicrosoft", prev.assistantToolsProviderMicrosoft),
    assistantToolsProviderGoogle: parseBool("assistantToolsProviderGoogle", prev.assistantToolsProviderGoogle),
    assistantToolsProviderInfomaniak: parseBool("assistantToolsProviderInfomaniak", prev.assistantToolsProviderInfomaniak),
    assistantToolsFollowUpEnabled: true,
    assistantInstalledToolIds,
    assistantMemoryEnabled: parseBool("assistantMemoryEnabled", prev.assistantMemoryEnabled),
    brainMapIncludeMailTasks: parseBool("brainMapIncludeMailTasks", prev.brainMapIncludeMailTasks),
    assistantAgentEnabled: parseBool("assistantAgentEnabled", prev.assistantAgentEnabled),
    autonomousMode: parseBool("autonomousMode", prev.autonomousMode),
    chatWebSearchEnabled: parseBool("chatWebSearchEnabled", prev.chatWebSearchEnabled),
    aiProvider: resolvedProvider,
    geminiApiKey: resolvedGeminiApiKey,
    chatProviders: resolvedChatProviders,
    voiceAutoStart: parseBool("voiceAutoStart", prev.voiceAutoStart),
    voiceInteractionMode:
      parsed.voiceInteractionMode === "pushToTalk" || parsed.voiceInteractionMode === "conversation"
        ? parsed.voiceInteractionMode
        : prev.voiceInteractionMode,
    pttShortcut: (() => {
      const raw = parsed.pttShortcut;
      if (!raw || typeof raw !== "object") return prev.pttShortcut;
      const s = raw as Partial<PushToTalkShortcut>;
      if (typeof s.displayLabel !== "string" || typeof s.accelerator !== "string") return prev.pttShortcut;
      let shortcut: PushToTalkShortcut = {
        displayLabel: s.displayLabel,
        accelerator: s.accelerator,
        captureInApp: s.captureInApp !== false,
        inAppKey: typeof s.inAppKey === "string" ? s.inAppKey : undefined,
      };
      // Bare "Alt" cannot be registered as a global shortcut on macOS.
      if (
        typeof navigator !== "undefined" &&
        navigator.platform.toLowerCase().includes("mac") &&
        shortcut.accelerator === "Alt"
      ) {
        shortcut = { ...shortcut, accelerator: "Alt+Space" };
      }
      return shortcut;
    })(),
    pttDoubleTapForLockedMode: parseBool("pttDoubleTapForLockedMode", prev.pttDoubleTapForLockedMode),
    pttSoundsEnabled: parseBool("pttSoundsEnabled", prev.pttSoundsEnabled),
    pttShowOverlay: parseBool("pttShowOverlay", prev.pttShowOverlay),
    pttGlobalWhenAppInBackground: parseBool(
      "pttGlobalWhenAppInBackground",
      prev.pttGlobalWhenAppInBackground
    ),
    clapToLaunchEnabled: parseBool("clapToLaunchEnabled", prev.clapToLaunchEnabled),
    assistantDebugUiEnabled: parseBool("assistantDebugUiEnabled", prev.assistantDebugUiEnabled),
    voiceToolsAlwaysApproved: (() => {
      const v = (parsed as { voiceToolsAlwaysApproved?: unknown }).voiceToolsAlwaysApproved;
      if (!Array.isArray(v)) return prev.voiceToolsAlwaysApproved;
      return [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0))];
    })(),
  };
}
