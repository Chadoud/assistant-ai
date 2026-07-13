import { describe, expect, it } from "vitest";
import { buildPersistedTurns } from "./conversationSync";
import type { Conversation } from "../hooks/useConversations";

describe("buildPersistedTurns", () => {
  it("appends hidden tool JSON after user/assistant turns", () => {
    const conv: Pick<Conversation, "messages" | "toolContext"> = {
      messages: [
        { id: "1", role: "user", content: "What's on my calendar?" },
        { id: "2", role: "assistant", content: "You have a standup at 9." },
      ],
      toolContext: [
        {
          name: "google_workspace",
          content: JSON.stringify({
            ok: true,
            data: { events: [{ id: "evt-1", summary: "Standup", html_link: "https://example.com" }] },
          }),
        },
      ],
    };
    const turns = buildPersistedTurns(conv);
    expect(turns).toHaveLength(3);
    expect(turns[2]).toMatchObject({ role: "tool", name: "google_workspace" });
  });
});
