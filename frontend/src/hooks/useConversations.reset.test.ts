// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  getConversationsStoreSnapshotForTests,
  resetConversationsStore,
  seedConversationsStoreForTests,
} from "./useConversations";

const STORAGE_KEY = "assistant_conversations_v1";

describe("resetConversationsStore", () => {
  afterEach(() => {
    resetConversationsStore();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  });

  it("clears module store and localStorage so prior chats cannot rewrite", () => {
    seedConversationsStoreForTests({
      activeId: "c-prior",
      conversations: [
        {
          id: "c-prior",
          title: "Prior account",
          messages: [
            { id: "u1", role: "user", content: "secret from account A" },
            { id: "a1", role: "assistant", content: "reply" },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(
      getConversationsStoreSnapshotForTests().conversations[0]?.messages.some((m) =>
        m.content.includes("account A"),
      ),
    ).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

    resetConversationsStore();

    const snap = getConversationsStoreSnapshotForTests();
    expect(snap.conversations).toHaveLength(1);
    expect(snap.conversations[0]?.messages).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
