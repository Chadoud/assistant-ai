import { describe, expect, it } from "vitest";
import { splitMergedAssistantMessage } from "./splitMergedVoiceMessages";
import type { ConversationMessage } from "../../../hooks/useConversations";

describe("splitMergedAssistantMessage", () => {
  it("splits legacy merged briefing blobs into separate messages", () => {
    const merged: ConversationMessage = {
      id: "merged",
      role: "assistant",
      content:
        "I opened WhatsApp and searched for mom — please verify the message was delivered in the app. Fetching your briefing now.Good evening sir. Breaking news: Trump says the Iran deal is signing today. It's a clear day in Geneva, 26 degrees. Done — I'll update your morning routine to only include finance news from now on.",
      voiceSource: "save_memory",
      createdAt: "2026-06-14T19:24:46.745Z",
    };

    const parts = splitMergedAssistantMessage(merged);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts[0].content).toContain("WhatsApp");
    expect(parts.some((part) => part.content.includes("Breaking news"))).toBe(true);
    expect(parts.some((part) => part.content.startsWith("Done —"))).toBe(true);
  });

  it("leaves short assistant messages unchanged", () => {
    const message: ConversationMessage = {
      id: "short",
      role: "assistant",
      content: "Understood. No message",
    };
    expect(splitMergedAssistantMessage(message)).toEqual([message]);
  });
});
