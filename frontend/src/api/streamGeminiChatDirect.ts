import type { ChatMessage, ChatMessageContent } from "./assistantChat";

type StreamGeminiChatDirectOptions = {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  onDelta: (delta: string) => void;
  onDone: (fullText: string) => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
};

function geminiModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return "gemini-2.5-flash";
  return trimmed.replace(/^models\//, "");
}

/** Flatten multimodal content to plain text for the offline Gemini path. */
function chatContentToPlainText(content: ChatMessageContent): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function extractGeminiStreamText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates) || !candidates.length) return "";
  const parts = (candidates[0] as { content?: { parts?: { text?: string }[] } })?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part?.text ?? "").join("");
}

/**
 * Stream Gemini chat directly from the renderer when the local app service is offline.
 * Tools, memory, and integrations are unavailable on this path.
 */
export async function streamGeminiChatDirect({
  apiKey,
  model,
  messages,
  onDelta,
  onDone,
  onError,
  signal,
}: StreamGeminiChatDirectOptions): Promise<void> {
  const key = apiKey.trim();
  if (!key) {
    onError("Gemini API key is missing.");
    return;
  }

  const systemMessage = messages.find((message) => message.role === "system");
  const turns = messages.filter((message) => message.role !== "system");
  const contents = turns.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: chatContentToPlainText(message.content) }],
  }));

  const requestBody: Record<string, unknown> = { contents };
  const systemText = systemMessage ? chatContentToPlainText(systemMessage.content).trim() : "";
  if (systemText) {
    requestBody.systemInstruction = { parts: [{ text: systemText }] };
  }

  const modelId = geminiModelId(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    onError(error instanceof Error ? error.message : "Could not reach Gemini.");
    return;
  }

  if (!res.ok) {
    let detail = `Gemini request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) detail = body.error.message;
    } catch {
      /* ignore */
    }
    onError(detail);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError("Gemini returned an empty response.");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonText = trimmed.slice(5).trim();
      if (!jsonText || jsonText === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonText) as unknown;
        const chunk = extractGeminiStreamText(parsed);
        if (!chunk) continue;
        accumulated += chunk;
        onDelta(chunk);
      } catch {
        /* skip malformed chunks */
      }
    }
  }

  onDone(accumulated);
}
