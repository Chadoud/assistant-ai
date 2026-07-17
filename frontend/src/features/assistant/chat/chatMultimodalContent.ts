/**
 * Map conversation messages ↔ multimodal chat API content parts.
 */

import type { ConversationMessage } from "../../../hooks/useConversations";
import type { ChatContentPart, ChatMessageContent } from "../../../api/assistantChat";

/** Parse a browser data URL into mime + raw base64 (no data: prefix). */
export function parseImageDataUrl(dataUrl: string): { mime: string; data: string } | null {
  const trimmed = dataUrl.trim();
  const m = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(trimmed);
  if (!m) return null;
  const mime = m[1].trim();
  const data = m[2].replace(/\s/g, "");
  if (!mime || !data) return null;
  return { mime, data };
}

/** Build API content for one conversation message (text or text+image parts). */
export function conversationMessageToChatContent(m: ConversationMessage): ChatMessageContent {
  const img = m.imageAttachment;
  if (m.role === "user" && img?.dataUrl) {
    const parsed = parseImageDataUrl(img.dataUrl);
    if (parsed) {
      const caption =
        m.content.trim() ||
        `Please describe and analyze this image (${img.name || "attachment"}).`;
      const parts: ChatContentPart[] = [
        { type: "text", text: caption },
        { type: "image", mime_type: parsed.mime, data: parsed.data },
      ];
      return parts;
    }
  }
  return m.content;
}

/** Map recent history to ChatMessage[], including multimodal user images when present. */
export function conversationHistoryToChatMessages(
  messages: ConversationMessage[],
  limit = 18,
): Array<{ role: "user" | "assistant"; content: ChatMessageContent }> {
  return messages
    .filter((m) => !m.streaming && !m.prefetching && m.content.trim())
    .slice(-limit)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: conversationMessageToChatContent(m),
    }));
}
