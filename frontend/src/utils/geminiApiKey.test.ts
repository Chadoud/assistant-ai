import { describe, expect, it } from "vitest";
import {
  isGeminiApiKeyConfigured,
  isGeminiApiKeyFormatPlausible,
  normalizeGeminiApiKey,
} from "./geminiApiKey";

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

describe("isGeminiApiKeyConfigured", () => {
  it("returns false for empty, short, or non-Google keys", () => {
    expect(isGeminiApiKeyConfigured("")).toBe(false);
    expect(isGeminiApiKeyConfigured("   ")).toBe(false);
    expect(isGeminiApiKeyConfigured("AIza123")).toBe(false);
    expect(isGeminiApiKeyConfigured("AQ.short")).toBe(false);
    expect(isGeminiApiKeyConfigured("sk-not-google")).toBe(false);
  });

  it("returns true for AIza-prefixed keys", () => {
    expect(isGeminiApiKeyConfigured(LEGACY_KEY)).toBe(true);
  });

  it("returns true for AQ. auth keys from AI Studio", () => {
    expect(isGeminiApiKeyConfigured(AUTH_KEY)).toBe(true);
    expect(isGeminiApiKeyConfigured(`=${AUTH_KEY}`)).toBe(true);
  });
});

describe("isGeminiApiKeyFormatPlausible", () => {
  it("accepts normalized legacy and auth keys", () => {
    expect(isGeminiApiKeyFormatPlausible(`=${LEGACY_KEY}`)).toBe(true);
    expect(isGeminiApiKeyFormatPlausible(AUTH_KEY)).toBe(true);
  });
});
