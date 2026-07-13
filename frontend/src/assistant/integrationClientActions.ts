/**
 * Desktop actions triggered by manage_connection from chat or voice tools.
 */

import { queueOpenWhatsAppSetup } from "../utils/deferredPanelActions";
import type { MainNavTab } from "../hooks/useMainNavItems";

export type IntegrationClientAction =
  | "integration_connect"
  | "integration_disconnect"
  | "open_whatsapp_setup";

export interface IntegrationClientActionDetail {
  action: IntegrationClientAction;
  providerId: string;
  providerLabel: string;
}

export const INTEGRATION_CLIENT_ACTION_EVENT = "exosites:integration-client-action";

export function dispatchIntegrationClientAction(detail: IntegrationClientActionDetail): void {
  window.dispatchEvent(new CustomEvent(INTEGRATION_CLIENT_ACTION_EVENT, { detail }));
}

/** Parse SSE JSON payload and dispatch when manage_connection returns a client action. */
export function dispatchIntegrationClientActionFromSsePayload(
  payload: Record<string, unknown>,
): void {
  const raw = payload.client_action;
  if (!raw || typeof raw !== "object") return;
  const ca = raw as {
    action?: unknown;
    provider_id?: unknown;
    provider_label?: unknown;
  };
  if (typeof ca.action !== "string" || typeof ca.provider_id !== "string") return;
  const action = ca.action as IntegrationClientAction;
  dispatchIntegrationClientAction({
    action,
    providerId: ca.provider_id,
    providerLabel:
      typeof ca.provider_label === "string" ? ca.provider_label : ca.provider_id,
  });
}

export interface HandleIntegrationClientActionOptions {
  detail: IntegrationClientActionDetail;
  requestTab: (tab: MainNavTab) => void;
  runIntegrationAction: (
    action: IntegrationClientAction,
    providerId: string,
    providerLabel: string,
  ) => Promise<void>;
}

/** Execute a manage_connection client action in the desktop shell. */
export function handleIntegrationClientAction({
  detail,
  requestTab,
  runIntegrationAction,
}: HandleIntegrationClientActionOptions): void {
  if (detail.action === "open_whatsapp_setup") {
    requestTab("sources");
    queueOpenWhatsAppSetup();
    return;
  }
  void runIntegrationAction(detail.action, detail.providerId, detail.providerLabel);
}
