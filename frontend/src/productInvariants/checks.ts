import {
  ACTIVE_MODEL_SECTION_PATH,
  FORBIDDEN_ACTIVE_MODEL_CHAT_MARKERS,
  FORBIDDEN_RAW_API_FETCH_ALLOWLIST,
  FORBIDDEN_RAW_API_FETCH_PATTERN,
  FORBIDDEN_SYNTHETIC_PROGRESS_PATTERNS,
  VOICE_BACKEND_MODULE,
  VOICE_BRIDGE_CONSUMER,
  VOICE_CREDENTIAL_CONSUMERS,
  type InvariantViolation,
} from "./invariants";
import {
  grepFrontendSource,
  readFrontendSource,
  skipSyntheticProgressScan,
  type SourceMatch,
} from "./sourceScan";

const VOICE_MODULE_IMPORT = /from\s+["'][^"']*ensureVoiceBackendReady["']/;
const VOICE_READY_CALL = /\b(assertVoiceBackendReady|ensureVoiceBackendReady)\s*\(/;


/**
 * Voice entry points must route credential sync through ensureVoiceBackendReady.ts.
 */
export function checkVoiceCredentialPath(): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  const moduleSource = readFrontendSource(`${VOICE_BACKEND_MODULE}.ts`);
  if (!/\bexport\s+async\s+function\s+ensureVoiceBackendReady\b/.test(moduleSource)) {
    violations.push({
      invariantId: "voice-credential-path",
      message: `${VOICE_BACKEND_MODULE}.ts must export ensureVoiceBackendReady`,
    });
  }
  if (!/\bexport\s+async\s+function\s+assertVoiceBackendReady\b/.test(moduleSource)) {
    violations.push({
      invariantId: "voice-credential-path",
      message: `${VOICE_BACKEND_MODULE}.ts must export assertVoiceBackendReady (re-export contract)`,
    });
  }
  if (!/\bensureVoiceBackendReady\s*\(/.test(moduleSource)) {
    violations.push({
      invariantId: "voice-credential-path",
      message: "assertVoiceBackendReady must delegate to ensureVoiceBackendReady in the same module",
    });
  }

  for (const consumer of VOICE_CREDENTIAL_CONSUMERS) {
    const source = readFrontendSource(consumer.relativePath);
    if (!VOICE_MODULE_IMPORT.test(source)) {
      violations.push({
        invariantId: "voice-credential-path",
        message: `${consumer.label} must statically import from ${VOICE_BACKEND_MODULE}`,
      });
      continue;
    }
    if (!VOICE_READY_CALL.test(source)) {
      violations.push({
        invariantId: "voice-credential-path",
        message: `${consumer.label} must call assertVoiceBackendReady or ensureVoiceBackendReady`,
      });
    }
  }

  const shellSource = readFrontendSource(VOICE_BRIDGE_CONSUMER.relativePath);
  if (!VOICE_BRIDGE_CONSUMER.bridgeImport.test(shellSource)) {
    violations.push({
      invariantId: "voice-credential-path",
      message: `${VOICE_BRIDGE_CONSUMER.label} must import useWorkspaceVoiceBridge`,
    });
  } else if (!VOICE_BRIDGE_CONSUMER.bridgeCall.test(shellSource)) {
    violations.push({
      invariantId: "voice-credential-path",
      message: `${VOICE_BRIDGE_CONSUMER.label} must compose voice via useWorkspaceVoiceBridge`,
    });
  }

  return violations;
}

/**
 * ActiveModelSection is Sort + Vision only — no standalone Chat card.
 */
export function checkActiveModelSectionIa(): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const source = readFrontendSource(ACTIVE_MODEL_SECTION_PATH);
  const matches: SourceMatch[] = [];

  for (const marker of FORBIDDEN_ACTIVE_MODEL_CHAT_MARKERS) {
    if (source.includes(marker)) {
      const line = source.split("\n").findIndex((row) => row.includes(marker)) + 1;
      matches.push({
        file: ACTIVE_MODEL_SECTION_PATH,
        line: line || 1,
        text: marker,
      });
    }
  }

  const cardCount = (source.match(/<ActiveModelCard\b/g) ?? []).length;
  if (cardCount !== 2) {
    violations.push({
      invariantId: "settings-active-models-ia",
      message: `ActiveModelSection must render exactly two ActiveModelCard instances (Sort + Vision); found ${cardCount}`,
    });
  }

  if (matches.length > 0) {
    violations.push({
      invariantId: "settings-active-models-ia",
      message: "ActiveModelSection must not reference Chat-card markers",
      matches,
    });
  }

  return violations;
}

/**
 * Scan frontend/src for synthetic progress anti-patterns from progress-and-loading.mdc.
 */
export function checkNoSyntheticProgress(): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const forbidden of FORBIDDEN_SYNTHETIC_PROGRESS_PATTERNS) {
    const matches = grepFrontendSource(forbidden.pattern, {
      skip: skipSyntheticProgressScan,
    });
    if (matches.length > 0) {
      violations.push({
        invariantId: "no-synthetic-progress",
        message: `${forbidden.description} (${forbidden.id})`,
        matches,
      });
    }
  }

  return violations;
}

function checkNoRawApiBaseFetch(): InvariantViolation[] {
  const matches = grepFrontendSource(FORBIDDEN_RAW_API_FETCH_PATTERN.pattern, {
    skip: (relativePath) => {
      const normalized = relativePath.replace(/\\/g, "/");
      return (
        normalized.includes("productInvariants/") ||
        FORBIDDEN_RAW_API_FETCH_ALLOWLIST.some((allowed) => normalized.endsWith(allowed))
      );
    },
  });
  if (matches.length === 0) return [];
  return [
    {
      invariantId: "no-raw-api-base-fetch",
      message: FORBIDDEN_RAW_API_FETCH_PATTERN.description,
      matches,
    },
  ];
}

export function runAllProductInvariantChecks(): InvariantViolation[] {
  return [
    ...checkVoiceCredentialPath(),
    ...checkActiveModelSectionIa(),
    ...checkNoSyntheticProgress(),
    ...checkNoRawApiBaseFetch(),
  ];
}
