import { getBreadcrumbs } from "./breadcrumbs";

export type IntentBucket =
  | "messaging_whatsapp"
  | "messaging_other"
  | "email"
  | "sort"
  | "integration_setup"
  | "calendar"
  | "unknown";

/** Derive a privacy-safe intent bucket from recent breadcrumbs (no prompt text). */
export function deriveIntentBucket(): IntentBucket {
  const crumbs = getBreadcrumbs();
  for (let i = crumbs.length - 1; i >= 0; i -= 1) {
    const c = crumbs[i];
    const platform = c.meta?.platform;
    if (c.action.includes("send_message") || c.meta?.tool_name === "send_message") {
      if (platform === "whatsapp_desktop" || platform === "whatsapp_cloud") {
        return "messaging_whatsapp";
      }
      return "messaging_other";
    }
    if (c.action.includes("integration_connect") || c.meta?.provider === "whatsapp") {
      return "integration_setup";
    }
    if (c.action.includes("gmail") || c.action.includes("mail")) {
      return "email";
    }
    if (c.action.includes("calendar")) {
      return "calendar";
    }
    if (c.action.includes("sort") || c.meta?.feature === "sort") {
      return "sort";
    }
  }
  return "unknown";
}

/** Last tool_name from breadcrumbs, if any. */
export function deriveLastToolName(): string | null {
  const crumbs = getBreadcrumbs();
  for (let i = crumbs.length - 1; i >= 0; i -= 1) {
    const tool = crumbs[i].meta?.tool_name;
    if (typeof tool === "string" && tool) return tool.slice(0, 64);
    if (crumbs[i].action.startsWith("assistant_tool_")) {
      return crumbs[i].action.replace("assistant_tool_", "").slice(0, 64);
    }
  }
  return null;
}
