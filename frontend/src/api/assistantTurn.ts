import type { ChatProviderId } from "../types/settings";
import { getApiHeaders, mapFetchFailureToError } from "./client";
import { desktopClient } from "../desktopClient";
import type { ChatMessage } from "./assistantChat";

interface AssistantTurnRequest {
  message: string;
  previous_user_message?: string | null;
  pending_calendar_draft?: Record<string, unknown> | null;
  pending_calendar_delete_draft?: Record<string, unknown> | null;
  memory_block?: string;
  conversation_summary?: string | null;
  assistant_tools_enabled?: boolean;
  assistant_agent_enabled?: boolean;
  messages_for_stream?: ChatMessage[];
  model?: string;
  provider?: ChatProviderId;
  api_key?: string;
  base_url?: string;
  use_web_search?: boolean;
  enable_tools?: boolean;
}

export interface AssistantTurnJsonResponse {
  mode: "complete" | "action" | "stream";
  intent: string;
  assistant_content?: string;
  calendar_event_draft?: Record<string, unknown>;
  calendar_delete_draft?: Record<string, unknown>;
  calendar_deleted_count?: number;
  action?: string;
  action_payload?: Record<string, unknown>;
  prefetch_calendar_events?: Array<Record<string, unknown>>;
  prefetch_mail_messages?: Array<Record<string, unknown>>;
  stream_system_prompt?: string;
}

/**
 * POST /assistant/turn — returns JSON for routed turns or SSE for generic chat.
 */
export async function postAssistantTurn(
  body: AssistantTurnRequest,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await desktopClient.fetch("/assistant/turn", {
      method: "POST",
      headers: await getApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw mapFetchFailureToError(e);
  }
}

export async function parseAssistantTurnJson(res: Response): Promise<AssistantTurnJsonResponse> {
  return (await res.json()) as AssistantTurnJsonResponse;
}

export function isAssistantTurnStream(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("text/event-stream");
}
