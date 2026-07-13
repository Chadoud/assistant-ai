import type { AppSettings } from "../types/settings";
import { isAssistantToolInstalledForCatalog } from "./assistantToolCatalogUi";
import {
  SYSTEM_COMMAND_CATALOG,
  assistantIntegrationProviderForCommand,
  isIntegrationReadSystemCommand,
  type SystemCommandIdV1,
} from "./catalog";
import { isAssistantIntegrationProviderEnabled } from "../utils/assistantIntegrationProviders";

/**
 * Central gate for running allowlisted commands triggered from assistant/chat flows.
 * When `connectedIntegrationIds` is provided, provider access follows External Sources links.
 */
export function shouldRunAssistantSystemCommand(
  settings: AppSettings,
  commandId: SystemCommandIdV1,
  connectedIntegrationIds?: Set<string> | null
): { ok: true } | { ok: false; reason: string } {
  if (!settings.assistantToolsEnabled) {
    return { ok: false, reason: "assistant_disabled" };
  }

  if (!isAssistantToolInstalledForCatalog(settings.assistantInstalledToolIds, commandId)) {
    return { ok: false, reason: "tool_not_installed" };
  }

  if (isIntegrationReadSystemCommand(commandId)) {
    if (!settings.assistantToolsReadEnabled) return { ok: false, reason: "read_disabled" };
    const p = assistantIntegrationProviderForCommand(commandId);
    if (p && !isAssistantIntegrationProviderEnabled(p, settings, connectedIntegrationIds)) {
      if (p === "microsoft") return { ok: false, reason: "provider_microsoft" };
      if (p === "google") return { ok: false, reason: "provider_google" };
      return { ok: false, reason: "provider_infomaniak" };
    }
    return { ok: true };
  }

  const risk = SYSTEM_COMMAND_CATALOG[commandId].risk;
  if (risk === "high") {
    if (!settings.assistantToolsWriteEnabled) return { ok: false, reason: "write_disabled" };
    if (
      commandId === "graph_onedrive_upload_text" &&
      !isAssistantIntegrationProviderEnabled("microsoft", settings, connectedIntegrationIds)
    ) {
      return { ok: false, reason: "provider_microsoft" };
    }
    if (
      commandId === "google_drive_upload_text" &&
      !isAssistantIntegrationProviderEnabled("google", settings, connectedIntegrationIds)
    ) {
      return { ok: false, reason: "provider_google" };
    }
  }

  return { ok: true };
}

export function assistantCommandNeedsHighRiskConfirm(commandId: SystemCommandIdV1): boolean {
  return SYSTEM_COMMAND_CATALOG[commandId].risk === "high";
}

/** Plain-language summary for the confirmation modal (no ML jargon). */
export function assistantHighRiskSummary(commandId: SystemCommandIdV1): string {
  return SYSTEM_COMMAND_CATALOG[commandId].description;
}
