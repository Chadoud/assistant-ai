/**
 * Collect OAuth tokens via main-process relay (never pull raw tokens into the renderer).
 */

import type { AppSettings } from "../types/settings";
import { resolveChatProviderCredentials } from "../utils/resolveChatProviderCredentials";
import { relayConnectorTokens } from "./connectorContext";

/** Provider relay without raw API keys — main session-prime already injected secrets. */
export function sendProviderRelayOverWebSocket(
  ws: WebSocket,
  settings: AppSettings,
): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const routing = resolveChatProviderCredentials(settings);
  // apiKey is already mask-stripped by resolveChatProviderCredentials.
  const apiKey = routing.provider === "ollama" ? "" : routing.apiKey;
  ws.send(
    JSON.stringify({
      type: "provider_relay",
      provider: routing.provider,
      model: routing.model,
      api_key: apiKey,
      base_url: routing.provider === "custom" ? routing.baseUrl : "",
    }),
  );
}

/** Relay tokens to the backend immediately after a successful connect (HTTP + optional WS). */
export async function relayIntegrationTokensAfterConnect(
  ws: WebSocket | null | undefined,
  settings?: AppSettings,
): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN && settings) {
    sendProviderRelayOverWebSocket(ws, settings);
  }
  await relayConnectorTokens();
}

export type ConnectVerification = Record<string, { ok: boolean; reason?: string }>;

type ConnectTrace = {
  providerId: string;
  providerLabel: string;
  ok: boolean;
  reason?: string;
  verification?: ConnectVerification;
  recordedAt: string;
};

let lastConnectTrace: ConnectTrace | null = null;

/** Record the latest voice-initiated connect attempt for debug export. */
export function recordConnectTrace(trace: Omit<ConnectTrace, "recordedAt">): void {
  lastConnectTrace = { ...trace, recordedAt: new Date().toISOString() };
}

export function getLastConnectTrace(): ConnectTrace | null {
  return lastConnectTrace;
}

export function formatConnectResultForVoice(
  providerId: string,
  providerLabel: string,
  ok: boolean,
  verification?: ConnectVerification,
  reason?: string,
): string {
  if (!ok) {
    const detail = reason?.trim() || "connect_failed";
    return (
      `[CONNECT_RESULT] FAILED provider=${providerId} label=${providerLabel} ` +
      `error=${detail}. Tell the user it didn't connect and what to do next.`
    );
  }
  const failed: string[] = [];
  if (verification) {
    for (const [scope, result] of Object.entries(verification)) {
      if (!result.ok) failed.push(scope);
    }
  }
  if (failed.length > 0) {
    return (
      `[CONNECT_RESULT] PARTIAL provider=${providerId} label=${providerLabel} ` +
      `missing_scopes=${failed.join(",")}. Say which access is still missing and offer to reconnect that part only.`
    );
  }
  return (
    `[CONNECT_RESULT] DONE provider=${providerId} label=${providerLabel}. ` +
    `Confirm ${providerLabel} is connected in one short sentence.`
  );
}

/** Provider id → integration-changed events External Sources panels listen on. */
const INTEGRATION_CHANGED_EVENTS: Record<string, readonly string[]> = {
  "google-gmail": ["exosites-google-integration-changed"],
  "google-drive": ["exosites-google-integration-changed"],
  "google-calendar": ["exosites-google-integration-changed"],
  "google-all": ["exosites-google-integration-changed"],
  microsoft: ["exosites:microsoft-integration-changed"],
  notion: ["exosites:notion-integration-changed"],
  dropbox: ["exosites:dropbox-integration-changed"],
  slack: ["exosites:slack-integration-changed"],
  whatsapp: ["exosites:whatsapp-integration-changed"],
  infomaniak: ["exosites:infomaniak-integration-changed"],
  "infomaniak-calendar": ["exosites-infomaniak-calendar-integration-changed"],
};

/** Notify renderer panels that an integration account changed (connect/disconnect). */
export function notifyIntegrationChanged(providerId: string): void {
  for (const eventName of INTEGRATION_CHANGED_EVENTS[providerId] ?? []) {
    window.dispatchEvent(new CustomEvent(eventName));
  }
}
