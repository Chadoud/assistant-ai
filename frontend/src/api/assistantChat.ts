import type { ChatProviderId } from "../types/settings";
import { getApiHeaders, mapFetchFailureToError } from "./client";
import { desktopClient } from "../desktopClient";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface StreamAssistantChatOptions {
  model: string;
  messages: ChatMessage[];
  onDelta: (delta: string) => void;
  onDone: (fullText: string) => void;
  onError: (message: string) => void;
  /** A backend tool is about to run (text-chat tool-calling progress). */
  onToolCall?: (toolName: string) => void;
  /** A backend tool finished. */
  onToolResult?: (toolName: string, ok: boolean, content?: string) => void;
  /** The Conductor relayed to another provider after a transient failure. */
  onRelay?: (info: { from: string; to: string; reason: string; kind?: string }) => void;
  signal?: AbortSignal;
  /** Active chat provider (defaults to local Ollama). */
  provider?: ChatProviderId;
  /** API key for cloud providers (sent for any non-Ollama provider). */
  apiKey?: string;
  /** Base URL for the OpenAI-compatible "custom" provider. */
  baseUrl?: string;
  /**
   * When true and provider is "gemini", attaches Google Search grounding so
   * the model can fetch live facts. Ignored for Ollama.
   */
  useWebSearch?: boolean;
  /** Allow the backend tool-calling loop (default true). */
  enableTools?: boolean;
  /** Desktop shell action from manage_connection (connect/disconnect/setup). */
  onClientAction?: (detail: {
    action: string;
    provider_id: string;
    provider_label: string;
  }) => void;
}

/**
 * Stream a chat completion from the backend `/assistant/chat` SSE endpoint.
 *
 * Events: `{delta: string}` per token, `{done: true, full: string}` at end,
 * `{error: string}` on failure.
 */
export async function streamAssistantChat({
  model,
  messages,
  onDelta,
  onDone,
  onError,
  onToolCall,
  onToolResult,
  onRelay,
  signal,
  provider = "ollama",
  apiKey = "",
  baseUrl = "",
  useWebSearch = false,
  enableTools = true,
  onClientAction,
}: StreamAssistantChatOptions): Promise<void> {
  let res: Response;
  try {
    res = await desktopClient.fetch("/assistant/chat", {
      method: "POST",
      headers: await getApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model,
        messages,
        provider,
        // Cloud providers need a key; Ollama (local) never sends one.
        api_key: provider === "ollama" ? "" : apiKey,
        base_url: provider === "custom" ? baseUrl : "",
        use_web_search: provider === "gemini" ? useWebSearch : false,
        enable_tools: enableTools,
      }),
      signal,
    });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    onError(mapFetchFailureToError(e).message);
    return;
  }

  if (!res.ok) {
    let detail = `Chat request failed (${res.status})`;
    try {
      const body = await res.text();
      const parsed = JSON.parse(body) as { detail?: string };
      if (parsed.detail) detail = parsed.detail;
    } catch {
      /* ignore parse errors */
    }
    onError(detail);
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    let done: boolean;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      onError("Connection interrupted.");
      return;
    }
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (typeof data.error === "string") {
        onError(data.error);
        return;
      }
      if (typeof data.delta === "string") {
        onDelta(data.delta);
      }
      if (data.tool_call && typeof data.tool_call === "object") {
        const name = (data.tool_call as { name?: unknown }).name;
        if (typeof name === "string") onToolCall?.(name);
      }
      if (data.tool_result && typeof data.tool_result === "object") {
        const tr = data.tool_result as { name?: unknown; ok?: unknown; content?: unknown };
        if (typeof tr.name === "string") {
          const content = typeof tr.content === "string" && tr.content.trim() ? tr.content : undefined;
          onToolResult?.(tr.name, tr.ok === true, content);
        }
      }
      if (data.client_action && typeof data.client_action === "object") {
        const ca = data.client_action as {
          action?: unknown;
          provider_id?: unknown;
          provider_label?: unknown;
        };
        if (typeof ca.action === "string" && typeof ca.provider_id === "string") {
          onClientAction?.({
            action: ca.action,
            provider_id: ca.provider_id,
            provider_label:
              typeof ca.provider_label === "string" ? ca.provider_label : ca.provider_id,
          });
        }
      }
      if (data.relay && typeof data.relay === "object") {
        const r = data.relay as { from?: unknown; to?: unknown; reason?: unknown; kind?: unknown };
        if (typeof r.from === "string" && typeof r.to === "string") {
          onRelay?.({
            from: r.from,
            to: r.to,
            reason: typeof r.reason === "string" ? r.reason : "",
            kind: typeof r.kind === "string" ? r.kind : undefined,
          });
        }
      }
      if (data.done === true) {
        onDone(typeof data.full === "string" ? data.full : "");
        return;
      }
    }
  }
}
