/**
 * Async helpers for loading connected integration IDs and fetching real
 * calendar/mail data from the Electron bridge.
 *
 * These are pure async functions (no React state) so they can be called
 * from within useCallback/sendMessage without triggering re-renders.
 *
 * Previously located at `hooks/useAssistantIntegrations.ts` — moved here
 * because this module contains no React hooks and belongs to the assistant
 * domain layer, not the hooks layer.
 */

import { hasElectronBridge } from "../utils/platform";
import { randomHexId } from "../utils/randomHexId";
import { shouldRunAssistantSystemCommand } from "../systemCommands/assistantExecutionGate";
import {
  MS_GRAPH_PROVIDER_IDS,
  loadConnectedIntegrationIds,
} from "../utils/assistantIntegrationProviders";
import {
  classifyIntent,
  computeCalendarWindow,
  buildMailSearchQuery,
  type AssistantIntent,
} from "../systemCommands/assistantIntent";
import type { SystemCommandIdV1 } from "../systemCommands/catalog";
import type { AppSettings } from "../types/settings";
import type {
  CalendarEvent,
  FetchedContext,
  MailMessage,
  MailRow,
} from "../systemCommands/assistantPrompts";

export { MS_GRAPH_PROVIDER_IDS, loadConnectedIntegrationIds } from "../utils/assistantIntegrationProviders";

// ── Provider specs ────────────────────────────────────────────────────────────

interface CalendarProviderSpec {
  commandId: string;
  label: string;
  requiredConnectedIds: readonly string[];
}

interface MailProviderSpec {
  commandId: string;
  label: string;
  requiredConnectedIds: readonly string[];
}

const CALENDAR_PROVIDERS: CalendarProviderSpec[] = [
  {
    commandId: "graph_calendar_list_events",
    label: "Outlook Calendar",
    requiredConnectedIds: MS_GRAPH_PROVIDER_IDS,
  },
  {
    commandId: "google_calendar_list_events",
    label: "Google Calendar",
    requiredConnectedIds: ["google-calendar"],
  },
  {
    commandId: "infomaniak_calendar_list_events",
    label: "Infomaniak Calendar",
    requiredConnectedIds: ["infomaniak-calendar"],
  },
];

const MAIL_PROVIDERS: MailProviderSpec[] = [
  {
    commandId: "graph_mail_search",
    label: "Outlook Mail",
    requiredConnectedIds: MS_GRAPH_PROVIDER_IDS,
  },
  {
    commandId: "gmail_search_messages",
    label: "Gmail",
    requiredConnectedIds: ["google-gmail"],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasAnyIntegrationConnected(
  connected: Set<string>,
  requiredIds: readonly string[]
): boolean {
  return requiredIds.some((id) => connected.has(id));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch mail/calendar data from connected providers via IPC.
 * Calendar rows preserve load errors so the UI never mis-labels failures
 * as "not connected".
 */
export async function fetchRealContext(
  text: string,
  settings: AppSettings,
  previousUserMessage?: string | null,
  intentOverride?: AssistantIntent | null,
): Promise<FetchedContext> {
  const ctx: FetchedContext = {
    calendars: [],
    mail: [],
    mailRows: [],
    anyProviderAttempted: false,
    calendarRows: [],
  };

  const connectedIds = await loadConnectedIntegrationIds();
  const intent = intentOverride ?? classifyIntent(text, previousUserMessage ?? null);
  const calendarWindowSource = [previousUserMessage, text].filter(Boolean).join(" ");
  const { startIso, endIso } = computeCalendarWindow(calendarWindowSource);

  if (/\btoday\b/i.test(text)) ctx.calendarWindowLabel = "today";
  else if (/\btomorrow\b/i.test(text)) ctx.calendarWindowLabel = "tomorrow";
  else ctx.calendarWindowLabel = "week";

  const tasks: Promise<void>[] = [];
  const wantsCalendar = intent === "read_calendar" || intent === "read_both";

  if (wantsCalendar) {
    const bridgeOk =
      hasElectronBridge() && typeof window.electronAPI?.systemCommandExecute === "function";
    if (!bridgeOk) {
      ctx.calendarBlockedReason = "no_bridge";
    } else if (!settings.assistantToolsEnabled) {
      ctx.calendarBlockedReason = "assistant_off";
    } else {
      if (
        connectedIds &&
        CALENDAR_PROVIDERS.every(
          (spec) => !hasAnyIntegrationConnected(connectedIds, spec.requiredConnectedIds)
        )
      ) {
        ctx.calendarNoLinkedAccounts = true;
      }

      for (const spec of CALENDAR_PROVIDERS) {
        const { commandId, label } = spec;
        if (connectedIds && !hasAnyIntegrationConnected(connectedIds, spec.requiredConnectedIds)) {
          continue;
        }
        const gate = shouldRunAssistantSystemCommand(
          settings,
          commandId as SystemCommandIdV1,
          connectedIds
        );
        if (!gate.ok) {
          ctx.calendarRows.push({ provider: label, events: [], gateReason: gate.reason });
          continue;
        }
        try {
          const res = await window.electronAPI!.systemCommandExecute!({
            commandId,
            args: { startDateTime: startIso, endDateTime: endIso, maxEvents: 25 },
            requestId: randomHexId(),
            context: {},
          });
          if (!res.ok) {
            ctx.calendarRows.push({
              provider: label,
              events: [],
              loadError: typeof res.reason === "string" ? res.reason : "unknown",
            });
            continue;
          }
          const raw = (res.data as Record<string, unknown> | undefined)?.events;
          const events = Array.isArray(raw) ? (raw as CalendarEvent[]) : [];
          ctx.calendarRows.push({ provider: label, events });
          ctx.calendars.push({ provider: label, events });
        } catch {
          ctx.calendarRows.push({ provider: label, events: [], loadError: "ipc_error" });
        }
      }
    }
  }

  const wantsMail = (intent === "read_mail" || intent === "read_both") && settings.assistantToolsEnabled;
  if (wantsMail) {
    if (typeof window.electronAPI?.systemCommandExecute !== "function") return ctx;

    // Derive a targeted search query when the user asks about a specific category
    // (invoices, bills, receipts, etc.). Falls back to "" which lets the server
    // apply its own default GMAIL_RECAP_QUERY / $filter.
    const mailSearchQuery = buildMailSearchQuery(text);

    for (const spec of MAIL_PROVIDERS) {
      const { commandId, label } = spec;
      if (connectedIds && !hasAnyIntegrationConnected(connectedIds, spec.requiredConnectedIds)) {
        continue;
      }
      tasks.push(
        (async () => {
          const gate = shouldRunAssistantSystemCommand(
            settings,
            commandId as SystemCommandIdV1,
            connectedIds
          );
          if (!gate.ok) return;
          try {
            const res = await window.electronAPI!.systemCommandExecute!({
              commandId,
              args: { query: mailSearchQuery, maxMessages: 20 },
              requestId: randomHexId(),
              context: {},
            });
            if (!res.ok) {
              const row: MailRow = {
                provider: label,
                messages: [],
                loadError: typeof res.reason === "string" ? res.reason : "unknown",
              };
              ctx.mailRows.push(row);
              return;
            }
            ctx.anyProviderAttempted = true;
            const raw = (res.data as Record<string, unknown> | undefined)?.messages;
            const messages = Array.isArray(raw) ? (raw as MailMessage[]) : [];
            ctx.mail.push({ provider: label, messages });
            ctx.mailRows.push({ provider: label, messages });
          } catch (e) {
            ctx.mailRows.push({
              provider: label,
              messages: [],
              loadError: e instanceof Error ? e.message : "ipc_error",
            });
          }
        })()
      );
    }
  }

  await Promise.allSettled(tasks);
  return ctx;
}

// ── Connector token relay ─────────────────────────────────────────────────────

/**
 * Relay OAuth tokens from the Electron keychain to the backend credential cache.
 *
 * Main process performs the relay (M2.3) so raw tokens never enter the renderer.
 */
export async function relayConnectorTokens(): Promise<void> {
  if (!hasElectronBridge()) return;
  const relayAll = window.electronAPI?.integrationRelayAllTokens;
  if (typeof relayAll === "function") {
    try {
      await relayAll();
    } catch {
      /* non-critical */
    }
    return;
  }
}
