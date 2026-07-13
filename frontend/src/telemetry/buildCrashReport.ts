import { getActiveContext } from "./activeContext";
import { getBreadcrumbs } from "./breadcrumbs";
import { deriveIntentBucket, deriveLastToolName } from "./intentBucket";
import { getOrCreateTelemetryInstanceId } from "./instanceId";
import { getOrCreateSessionId } from "./sessionId";
import type { CrashSource } from "./crashBackendIngest";

function fnv1aHex(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type EnrichedCrashFields = {
  instance_id: string;
  session_id: string;
  active_feature: string | null;
  active_tab: string | null;
  intent_bucket: string;
  tool_name: string | null;
  last_events_json: string;
  dedupe_key: string;
  conversation_id_hash: string | null;
};

export function buildEnrichedCrashFields(
  source: CrashSource,
  errorMessage: string,
  conversationId?: string | null,
): EnrichedCrashFields {
  const sessionId = getOrCreateSessionId();
  const ctx = getActiveContext();
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const dedupeKey = fnv1aHex(`${sessionId}:${source}:${errorMessage.slice(0, 200)}:${minuteBucket}`);
  const crumbs = getBreadcrumbs();

  return {
    instance_id: getOrCreateTelemetryInstanceId(),
    session_id: sessionId,
    active_feature: ctx.active_feature,
    active_tab: ctx.active_tab,
    intent_bucket: deriveIntentBucket(),
    tool_name: deriveLastToolName(),
    last_events_json: JSON.stringify(crumbs).slice(0, 16_000),
    dedupe_key: dedupeKey,
    conversation_id_hash: conversationId ? fnv1aHex(conversationId) : null,
  };
}
