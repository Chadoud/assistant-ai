import type { SystemCommandIdV1 } from "../systemCommands/catalog";
import type { PushToTalkShortcut, VoiceInteractionMode } from "./voiceInteraction";
import type { SortStructureTemplate } from "./sortStructure";

export interface UserRule {
  id: string;
  enabled: boolean;
  /** Higher runs first among matches. */
  priority: number;
  /** fnmatch on file name, e.g. *.pdf or invoice_* */
  pattern: string;
  action: "target_folder" | "skip";
  /** Required when action is target_folder */
  folder?: string;
}

/** One-click automation vs safety tradeoff; maps to minConfidence unless `custom`. */
export type AutomationPreset = "strict" | "balanced" | "aggressive" | "custom";

/** How the next sort job chooses folders — mutually exclusive at payload time. */
export type SortClassifyMode = "builtin" | "structure" | "custom";

/** Interface language (UI strings). */
export type UiLocale = "en" | "fr" | "it" | "de";

/**
 * Chat assistant provider id.
 * - "ollama": local models (no key)
 * - "gemini" / "openai" / "anthropic": cloud, bring-your-own API key
 * - "custom": any OpenAI-compatible endpoint (base URL + key)
 */
export type ChatProviderId = "ollama" | "gemini" | "openai" | "anthropic" | "custom";

/** Per-provider chat configuration the user enters in Settings. */
export interface ChatProviderConfig {
  /** API key for cloud providers (stored locally, sent only to that provider). */
  apiKey: string;
  /** Base URL for the OpenAI-compatible "custom" provider (and optional overrides). */
  baseUrl?: string;
  /** The model id selected for this provider (e.g. "gpt-4o", "claude-sonnet-4-...", an Ollama tag). */
  model: string;
}

export interface AppSettings {
  /** Ollama model used for local sort/classify jobs. Separate from the chat model. */
  model: string;
  /**
   * Model used for text chat and voice assistant.
   * Holds a Gemini slug (e.g. "gemini-2.5-flash") when aiProvider is "gemini",
   * or an Ollama model name when aiProvider is "ollama".
   * Empty string = not configured yet.
   */
  chatModel: string;
  /** UI language (English, French, Italian, German). */
  uiLocale: UiLocale;
  outputDir: string;
  mode: "copy" | "move";
  language: string;
  folderViewMode: "rows" | "grid";
  /** Empty = automatic first vision-capable Ollama model. */
  visionModel: string;
  /** After AI classification, first matching rule by priority can override or skip. */
  rules: UserRule[];
  /** How to handle an existing file at the destination basename. */
  onCollision: "uniquify" | "error";
  /** Optional 0–1 floor; below → uncertain folder (server has its own default if unset). */
  minConfidence: number | null;
  /** Strict / balanced / aggressive set minConfidence for each job; custom uses minConfidence as edited. */
  automationPreset: AutomationPreset;
  /**
   * Tesseract `.traineddata` codes to allow for OCR (whitelist). Empty = all packs reported in Settings (System status).
   * New installs default to a fixed multilingual list (`DEFAULT_OCR_TESSERACT_LANGUAGE_CODES` in `utils/tesseractLangCatalog.ts`).
   */
  ocrLanguages: string[];
  /**
   * Usage analytics — on by default; disclosed in Terms/Privacy. Opt out in Settings.
   */
  telemetryOptIn: boolean;
  /** Crash reports — on by default (legitimate interest); object in Settings → Privacy. */
  crashReportsOptIn: boolean;
  /**
   * User turned off usage or crash reporting in Settings — do not re-enable on legal re-accept.
   */
  diagnosticsOptOutExplicit: boolean;
  /**
   * Matches {@link LEGAL_TERMS_BUNDLE_VERSION} in `constants.ts` after the user accepts Terms & Privacy on first-run setup.
   * `null` means not accepted for the current bundle version.
   */
  acceptedLegalTermsVersion: string | null;
  /**
   * Optional Ollama system prompt for the primary sort/classify step. Empty = built-in app prompt.
   * Stored locally; sent with each sort job to the local API.
   */
  sortSystemPrompt: string;
  /** Nested folder structure template (themes + optional caps). */
  sortStructureTemplate: SortStructureTemplate;
  /** Active classify path for sort jobs; structure and custom prompt are not sent together. */
  sortClassifyMode: SortClassifyMode;
  /**
   * Per-job document briefing: null = let the server default apply; true/false forces on or off.
   * Skipping briefing speeds sorting and may reduce nuance on edge cases.
   */
  documentBriefingEnable: boolean | null;
  /**
   * Master switch for AI assistant allowlisted system commands (navigation, integrations, …).
   * When false, assistant replies never trigger IPC execution.
   */
  assistantToolsEnabled: boolean;
  /** When master is on: allow read-only integration tools (calendar list, mail search). Default on. */
  assistantToolsReadEnabled: boolean;
  /** When master is on: allow higher-risk actions (write uploads, open external apps, …). Default off. */
  assistantToolsWriteEnabled: boolean;
  assistantToolsProviderMicrosoft: boolean;
  assistantToolsProviderGoogle: boolean;
  assistantToolsProviderInfomaniak: boolean;
  /**
   * After a tool runs successfully, allow one optional follow-up model turn with redacted tool JSON (Phase B).
   */
  assistantToolsFollowUpEnabled: boolean;
  /**
   * Installed assistant catalog actions (Settings → Browse all actions).
   * `null`: every catalog action is installed — same as legacy behaviour before per-tool install existed.
   * Non-null: only listed ids may run (still subject to master toggle, read/write tier, and provider toggles).
   */
  assistantInstalledToolIds: SystemCommandIdV1[] | null;
  /** Persist user preferences and context across sessions via assistant memory. */
  assistantMemoryEnabled: boolean;
  /** Show Gmail/Outlook-suggested tasks on the brain map (off = curated/actionable only). */
  brainMapIncludeMailTasks: boolean;
  /** Show low-value chats (FAQ, retries, no summary) on the brain map. Default off. */
  brainMapIncludeLowValueChats: boolean;
  /** Allow the assistant to plan and execute autonomous multi-step tasks. */
  assistantAgentEnabled: boolean;
  /**
   * When on, chat and voice may run sensitive tools without per-call AutonomyPolicy blocks.
   * Approval-tier tools in voice still show the consent modal. Default off (fail-closed).
   */
  autonomousMode: boolean;
  /** When using Gemini as chat provider, attach Google Search grounding so the model can fetch live facts. */
  chatWebSearchEnabled: boolean;
  /** Active AI provider for text chat (see {@link ChatProviderId}). */
  aiProvider: ChatProviderId;
  /** Gemini API key (stored locally, never sent to any server except Google AI). Mirrored into chatProviders.gemini and kept for voice. */
  geminiApiKey: string;
  /**
   * Per-provider chat configuration (API key, base URL, selected model), keyed by {@link ChatProviderId}.
   * The active provider's config is what gets sent on each chat request.
   */
  chatProviders: Record<string, ChatProviderConfig>;
  /**
   * Automatically activate the voice mic when the app opens (and when the backend comes back online).
   * Applies only in {@link VoiceInteractionMode} `conversation`.
   */
  voiceAutoStart: boolean;
  /** Conversation (toggle mic) vs push-to-talk (hold key to speak). */
  voiceInteractionMode: VoiceInteractionMode;
  /** Push-to-talk shortcut and global capture (when mode is pushToTalk). */
  pttShortcut: PushToTalkShortcut;
  /** Double-tap PTT key quickly to stay listening until tapped again (Omi-style locked mode). */
  pttDoubleTapForLockedMode: boolean;
  /** Play subtle sounds when PTT starts and ends. */
  pttSoundsEnabled: boolean;
  /** Show a small on-screen indicator while the PTT key is held. */
  pttShowOverlay: boolean;
  /** Register a global shortcut so PTT works when another app is focused (desktop only). */
  pttGlobalWhenAppInBackground: boolean;
  /**
   * Listen for a double hand-clap to launch/focus the app (and open the voice layer).
   * When on, the app keeps a low-processing mic stream open and registers a login item
   * so a double-clap brings it forward even from the background. Opt-in, default off.
   */
  clapToLaunchEnabled: boolean;
  /**
   * Voice tools (screen capture, code runner, …) the user chose to always allow without
   * showing the consent modal again. Persisted locally; revoke in Settings → Assistant actions.
   */
  voiceToolsAlwaysApproved: string[];
  /**
   * Dev builds only: show chat debug footer (snapshot export, voice turn traces).
   * Ignored in production; product admins always see debug when entitled.
   */
  assistantDebugUiEnabled: boolean;
}
