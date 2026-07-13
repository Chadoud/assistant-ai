import { desktopClient } from "../desktopClient";

/**
 * Returns the built-in primary classify system prompt from the local API (``SYSTEM_PROMPT``).
 */
export async function fetchSortPromptDefault(): Promise<string> {
  return desktopClient.getSortPromptDefault();
}
