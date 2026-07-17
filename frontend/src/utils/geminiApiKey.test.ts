import { describe, expect, it } from "vitest";
import { GEMINI_SECRET_MASK } from "./geminiConnection";
import { isGeminiKeyFormatPlausible, normalizeGeminiApiKey } from "./geminiApiKey";

const LEGACY_KEY = "AIzaSy0123456789012345678901234567890";
const AUTH_KEY = "AQ.Ab8RN6Jy1Y6Ms0cfruHo_hKeCbGrWxUmGWv9Sy";

describe("normalizeGeminiApiKey", () => {
  it("strips Excel formula prefix and quotes", () => {
    expect(normalizeGeminiApiKey(`=${LEGACY_KEY}`)).toBe(LEGACY_KEY);
    expect(normalizeGeminiApiKey(`"${LEGACY_KEY}"`)).toBe(LEGACY_KEY);
  });

  it("removes whitespace from wrapped auth keys", () => {
    expect(normalizeGeminiApiKey(`=${AUTH_KEY.slice(0, 10)} ${AUTH_KEY.slice(10)}`)).toBe(AUTH_KEY);
  });
});

describe("isGeminiKeyFormatPlausible", () => {
  it("returns false for empty, short, or non-Google keys", () => {
    expect(isGeminiKeyFormatPlausible("")).toBe(false);
    expect(isGeminiKeyFormatPlausible("   ")).toBe(false);
    expect(isGeminiKeyFormatPlausible("AIza123")).toBe(false);
    expect(isGeminiKeyFormatPlausible("AQ.short")).toBe(false);
    expect(isGeminiKeyFormatPlausible("sk-not-google")).toBe(false);
    expect(isGeminiKeyFormatPlausible(GEMINI_SECRET_MASK)).toBe(false);
  });

  it("returns true for AIza-prefixed keys", () => {
    expect(isGeminiKeyFormatPlausible(LEGACY_KEY)).toBe(true);
  });

  it("returns true for AQ. auth keys from AI Studio", () => {
    expect(isGeminiKeyFormatPlausible(AUTH_KEY)).toBe(true);
    expect(isGeminiKeyFormatPlausible(`=${AUTH_KEY}`)).toBe(true);
  });
});
