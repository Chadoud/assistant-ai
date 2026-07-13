import { describe, expect, it } from "vitest";
import { appendVoiceTurnMessages } from "./commitAssistantTurn";
import type { ConversationMessage } from "../../../hooks/useConversations";

describe("appendVoiceTurnMessages coalescing", () => {
  it("merges continuation fragments within the coalesce window", () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 500).toISOString();
    const prev: ConversationMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "All my chess.com emails as",
        createdAt: now,
        voiceSource: "voice",
      },
    ];
    const next = appendVoiceTurnMessages(prev, {
      userText: "And like I don't want to receive those emails from chess.com.",
      assistantText: "Let me move those emails for you.",
      meta: null,
      briefingRunId: null,
      recentAssistantLines: [],
      userCommitContext: {
        briefingActive: false,
        msSinceBriefingEnded: Number.POSITIVE_INFINITY,
      },
      makeMessageId: () => "u2",
      nowIso: later,
    });
    expect(next.filter((m) => m.role === "user")).toHaveLength(1);
    expect(next[0].content).toContain("chess.com");
    expect(next[0].content).toContain("don't want");
  });
});
