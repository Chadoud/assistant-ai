import { describe, expect, it } from "vitest";
import { coerceMessageContent } from "./coerceMessageContent";

describe("coerceMessageContent", () => {
  it("passes through strings", () => {
    expect(coerceMessageContent("hello")).toBe("hello");
  });

  it("coerces null and undefined to empty", () => {
    expect(coerceMessageContent(null)).toBe("");
    expect(coerceMessageContent(undefined)).toBe("");
  });

  it("stringifies objects instead of throwing in React render", () => {
    expect(coerceMessageContent({ ok: true })).toBe('{"ok":true}');
  });
});
