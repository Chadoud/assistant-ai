import {
  ASSISTANT_ACCESS_GUIDANCE_MODAL_DISMISSED_SESSION_KEY,
  ASSISTANT_ACCESS_GUIDANCE_PROMPT_EVENT,
  ASSISTANT_PERMISSIONS_PROMPT_EVENT,
} from "../constants";

/** Shape aligned with {@link FetchedContext} in AssistantChatPanel (calendar subset only). */
export interface CalendarAccessGuidanceContext {
  calendarBlockedReason?: "no_bridge" | "assistant_off";
  /** No External-sources calendar integration connected — filtered before IPC. */
  calendarNoLinkedAccounts?: boolean;
  calendarRows: Array<{
    events: unknown[];
    loadError?: string;
    gateReason?: string;
  }>;
}

export type CalendarAccessGuidanceFocus =
  | "master"
  | "read_integration"
  | "provider_scope"
  | "accounts_api";

/**
 * Decide whether to show an authorization / setup modal after a calendar fetch.
 * Returns null when the user does not need an extra prompt (happy path or desktop-only message).
 */
export function deriveCalendarAccessGuidanceFocus(
  ctx: CalendarAccessGuidanceContext
): CalendarAccessGuidanceFocus | null {
  if (ctx.calendarBlockedReason === "assistant_off") return "master";
  if (ctx.calendarBlockedReason === "no_bridge") return null;
  if (ctx.calendarNoLinkedAccounts) return "accounts_api";

  const rows = ctx.calendarRows;
  if (rows.length === 0) return null;

  const allGatesRead =
    rows.length > 0 && rows.every((r) => r.gateReason === "read_disabled");
  if (allGatesRead) return "read_integration";

  const hasLoadError = rows.some((r) => r.loadError);
  if (hasLoadError) return "accounts_api";

  const hasProviderGate = rows.some((r) =>
    ["provider_microsoft", "provider_google", "provider_infomaniak"].includes(r.gateReason ?? "")
  );
  if (hasProviderGate) return "provider_scope";

  return null;
}

/**
 * Opens the permission modal (master switch) or the access-guidance modal when calendar access failed.
 * Respects one dismiss per browser tab session unless {@link ASSISTANT_PERMISSIONS_PROMPT_EVENT} handles master.
 */
export function dispatchCalendarAccessGuidance(ctx: CalendarAccessGuidanceContext): void {
  const focus = deriveCalendarAccessGuidanceFocus(ctx);
  if (focus === null) return;

  if (focus === "master") {
    window.dispatchEvent(new CustomEvent(ASSISTANT_PERMISSIONS_PROMPT_EVENT, { detail: { force: true } }));
    return;
  }

  try {
    if (sessionStorage.getItem(ASSISTANT_ACCESS_GUIDANCE_MODAL_DISMISSED_SESSION_KEY) === "1") return;
  } catch {
    /* ignore */
  }

  window.dispatchEvent(
    new CustomEvent(ASSISTANT_ACCESS_GUIDANCE_PROMPT_EVENT, {
      detail: { focus, force: false },
    })
  );
}

/** Call after a successful calendar load so the next failure can prompt again in the same session. */
export function clearAccessGuidanceSessionDismiss(): void {
  try {
    sessionStorage.removeItem(ASSISTANT_ACCESS_GUIDANCE_MODAL_DISMISSED_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
