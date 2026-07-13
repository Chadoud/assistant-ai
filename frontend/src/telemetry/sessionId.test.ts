import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateSessionId, rotateSessionId } from "./sessionId";

function mockSessionStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("sessionStorage", storage);
  return storage;
}

describe("sessionId", () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a stable id within the same session", () => {
    const a = getOrCreateSessionId();
    const b = getOrCreateSessionId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });

  it("rotates to a new id", () => {
    const first = getOrCreateSessionId();
    const second = rotateSessionId();
    expect(second).not.toBe(first);
    expect(getOrCreateSessionId()).toBe(second);
  });
});
