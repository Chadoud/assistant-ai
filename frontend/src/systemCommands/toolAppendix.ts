import { EXOSITES_ACTION_FENCE, SYSTEM_COMMAND_CATALOG } from "./catalog";

/**
 * Mail and calendar commands are fetched deterministically by the frontend
 * (see fetchRealContext / useAssistantIntegrations) and must NOT appear in the
 * LLM tool appendix. If they do, the LLM generates raw JSON action blocks for
 * queries like "what are my latest invoices" instead of letting the intent
 * classifier route the query to the grounded fetch path.
 */
const LLM_CALLABLE_EXCLUDE: ReadonlySet<string> = new Set([
  "graph_mail_search",
  "gmail_search_messages",
  "graph_calendar_list_events",
  "google_calendar_list_events",
  "infomaniak_calendar_list_events",
]);

/**
 * Short appendix for assistant system prompts — lists allowed command IDs.
 * Only non-data-fetch commands (navigation, file uploads) are included so the
 * LLM cannot accidentally emit mail/calendar fetch blocks that the frontend
 * does not execute.
 */
export function buildAssistantToolAppendix(): string {
  const lines = Object.entries(SYSTEM_COMMAND_CATALOG)
    .filter(([id]) => !LLM_CALLABLE_EXCLUDE.has(id))
    .map(([id, meta]) => `- ${id} (${meta.risk}): ${meta.description}`);
  return [
    `Optional structured actions: wrap JSON in \`\`\`${EXOSITES_ACTION_FENCE}\`\`\` fences.`,
    'Shape: {"v":1,"commandId":"<id>","args":{...}}',
    ...lines,
  ].join("\n");
}
