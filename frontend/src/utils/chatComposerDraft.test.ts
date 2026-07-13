import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_DRAFT_QUEUE_SESSION_KEY } from "../constants";
import { consumeChatDraft, queueChatDraft } from "./chatComposerDraft";

describe("chatComposerDraft", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers draft only to the matching chat surface", () => {
    queueChatDraft("Retry this task", "assistant");
    expect(consumeChatDraft("exo")).toBeNull();
    expect(consumeChatDraft("assistant")).toBe("Retry this task");
    expect(consumeChatDraft("assistant")).toBeNull();
  });

  it("stores target in session payload", () => {
    queueChatDraft("Hello", "assistant");
    const raw = sessionStorage.getItem(CHAT_DRAFT_QUEUE_SESSION_KEY);
    expect(raw).toContain('"target":"assistant"');
  });
});
