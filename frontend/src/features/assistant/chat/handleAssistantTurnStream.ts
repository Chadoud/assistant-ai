import { dispatchIntegrationClientActionFromSsePayload } from "../../../assistant/integrationClientActions";
import { toDisplayText } from "./assistantChatHistory";
import { sanitizeUnbackedPromiseClaim } from "../../../utils/chatPromiseGuard";
import { notifyAssistantReplyComplete } from "../../../systemCommands/assistantReplyNotify";
import { pushExecutionTrace } from "./assistantExecutionTrace";
import type { RunAssistantSendMessageParams } from "./assistantSendTypes";

/** Consume SSE from POST /assistant/turn when mode=stream. */
export async function handleAssistantTurnStream(
  res: Response,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let accumulatedText = "";
  const { setMessages, stampEmission, setIsStreaming, t } = params;
  const promiseFailureText = t("assistant.actionPromiseUnfulfilled");

  pushExecutionTrace({ path: "turn_sse", toolsCalled: [] });

  while (true) {
    const { done, value } = await reader.read();
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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, ...stampEmission(m), content: `⚠ ${data.error}`, streaming: false }
              : m,
          ),
        );
        setIsStreaming(false);
        return;
      }
      if (typeof data.delta === "string") {
        accumulatedText += data.delta;
        const display = toDisplayText(accumulatedText);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: display, streaming: true } : m,
          ),
        );
      }
      dispatchIntegrationClientActionFromSsePayload(data);
      if (data.done === true) {
        const rawFull = typeof data.full === "string" ? data.full : accumulatedText;
        const raw = toDisplayText(typeof rawFull === "string" ? rawFull : String(rawFull ?? ""));
        const full = sanitizeUnbackedPromiseClaim(raw || "Done.", false, promiseFailureText);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, ...stampEmission(m), content: full, streaming: false }
              : m,
          ),
        );
        setIsStreaming(false);
        notifyAssistantReplyComplete(full);
        pushExecutionTrace({ path: "turn_sse", toolsCalled: [], promiseGuardFired: full !== raw });
        return;
      }
    }
  }
  setIsStreaming(false);
}
