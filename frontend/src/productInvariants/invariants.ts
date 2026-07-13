import type { SourceMatch } from "./sourceScan";

type ProductInvariant = {
  id: string;
  title: string;
  rule: string;
  source: string;
};

/** Catalog of product rules enforced by `productInvariants.test.ts`. */
export const PRODUCT_INVARIANTS: ProductInvariant[] = [
  {
    id: "voice-credential-path",
    title: "Voice credential path",
    rule:
      "Push-to-talk and ambient voice entry points import the shared ensureVoiceBackendReady module and call assertVoiceBackendReady or ensureVoiceBackendReady — no ad-hoc Gemini sync.",
    source: ".cursor/rules + docs/adr/004-voice-credentials.md",
  },
  {
    id: "settings-active-models-ia",
    title: "Settings IA: no CHAT card in Active models",
    rule:
      "ActiveModelSection shows Sort + Vision only. It must not render a separate Chat model card or reference chat-only active-model copy.",
    source: "docs/REMEDIATION_PLAN.md P7-7.3.1",
  },
  {
    id: "no-raw-api-base-fetch",
    title: "No raw API_BASE fetch",
    rule: "HTTP calls use desktopClient or api/client — not fetch(`${API_BASE}...`) in feature code.",
    source: "docs/REMEDIATION_PLAN.md P4-4.1.3",
  },
  {
    id: "no-synthetic-progress",
    title: "No synthetic progress",
    rule:
      "Frontend must not derive numeric throughput or (n/m) progress from animation timers, easing, or configured caps without server-grounded counts.",
    source: ".cursor/rules/progress-and-loading.mdc",
  },
];

type ForbiddenPattern = {
  id: string;
  pattern: RegExp;
  description: string;
};

/** Grep targets aligned with progress-and-loading.mdc forbidden examples. */
export const FORBIDDEN_SYNTHETIC_PROGRESS_PATTERNS: ForbiddenPattern[] = [
  {
    id: "animation-fraction-floor",
    pattern: /floor\s*\(\s*animationFraction\s*\*/i,
    description: "floor(animationFraction * …) sham item counts",
  },
  {
    id: "animation-fraction-symbol",
    pattern: /\banimationFraction\b/,
    description: "animationFraction progress driver",
  },
  {
    id: "raf-mapped-document-count",
    pattern: /requestAnimationFrame[\s\S]{0,120}(processed|fetched|exported|itemsProcessed)/i,
    description: "requestAnimationFrame loop mapping latency to document counts",
  },
  {
    id: "timer-mapped-document-count",
    pattern: /set(?:Interval|Timeout)[\s\S]{0,120}(processed|fetched|exported)\s*[/=]/i,
    description: "timer-driven (processed/total) without API grounding",
  },
];

/** Raw fetch to API_BASE must go through api/client or desktopClient only. */
export const FORBIDDEN_RAW_API_FETCH_ALLOWLIST = [
  "api/client.ts",
  "desktopClient/index.ts",
] as const;

export const FORBIDDEN_RAW_API_FETCH_PATTERN: ForbiddenPattern = {
  id: "raw-api-base-fetch",
  pattern: /fetch\s*\(\s*`\$\{API_BASE\}/,
  description: "Raw fetch(`${API_BASE}...`) — use desktopClient or api/client",
};

export type InvariantViolation = {
  invariantId: string;
  message: string;
  matches?: SourceMatch[];
};

export const VOICE_CREDENTIAL_CONSUMERS = [
  { label: "usePushToTalk", relativePath: "hooks/usePushToTalk.ts" },
  { label: "useWorkspaceVoiceBridge", relativePath: "hooks/useWorkspaceVoiceBridge.ts" },
] as const;

export const VOICE_BRIDGE_CONSUMER = {
  label: "AppMainWorkspace",
  relativePath: "components/AppMainWorkspace.tsx",
  bridgeImport: /from\s+["'][^"']*useWorkspaceVoiceBridge["']/,
  bridgeCall: /\buseWorkspaceVoiceBridge\s*\(/,
} as const;

export const VOICE_BACKEND_MODULE = "voice/ensureVoiceBackendReady";

export const ACTIVE_MODEL_SECTION_PATH = "components/settings/ActiveModelSection.tsx";

/** i18n keys / props that imply a dedicated Chat card in Active models. */
export const FORBIDDEN_ACTIVE_MODEL_CHAT_MARKERS = [
  "activeModels.chatTitle",
  "footerChatGemini",
  "footerChatOllama",
  "settings.chatModel",
] as const;
