import { describe, expect, it } from "vitest";
import type { ScopedMemoryEntry } from "../api/memory";
import { memoryMayHaveOpenTarget, memoryOriginProviderKey } from "./memoryOrigin";

function entry(partial: Partial<ScopedMemoryEntry> & Pick<ScopedMemoryEntry, "id">): ScopedMemoryEntry {
  return {
    id: partial.id,
    category: partial.category ?? "notes",
    key: partial.key ?? "key",
    value: partial.value ?? "value",
    source: partial.source ?? "manual",
    reviewed: partial.reviewed ?? true,
    conversation_id: partial.conversation_id ?? null,
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00Z",
    provenance: partial.provenance,
    noise_score: partial.noise_score,
    origin_kind: partial.origin_kind,
    origin_ref: partial.origin_ref,
    origin_url: partial.origin_url,
    origin_label: partial.origin_label,
    linked_task_id: partial.linked_task_id,
  };
}

describe("memoryOriginProviderKey", () => {
  it("maps known provider kinds to i18n keys", () => {
    expect(memoryOriginProviderKey("gmail_message")).toBe("memories.source.gmail");
    expect(memoryOriginProviderKey("google_calendar_event")).toBe("memories.source.googleCalendar");
  });
});

describe("memoryMayHaveOpenTarget", () => {
  it("returns true when origin envelope is present", () => {
    expect(
      memoryMayHaveOpenTarget(
        entry({
          id: 1,
          origin_ref: "gmail:mail:abc",
          origin_url: "https://mail.google.com/mail/u/0/#inbox/abc",
        }),
      ),
    ).toBe(true);
  });

  it("returns false for hidden promotional suggestions", () => {
    expect(
      memoryMayHaveOpenTarget(
        entry({
          id: 2,
          source: "auto",
          reviewed: false,
          noise_score: 0.5,
          origin_ref: "gmail:mail:promo",
        }),
      ),
    ).toBe(false);
  });
});
