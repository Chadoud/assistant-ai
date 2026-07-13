import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AppSettings } from "../types/settings";
import {
  assertVoiceBackendReady,
  ensureVoiceBackendReady,
  voiceBackendNotReadyMessage,
} from "./ensureVoiceBackendReady";

vi.mock("../api/client", () => ({
  API_BASE: "http://127.0.0.1:8765",
  getApiHeaders: vi.fn(async () => ({ "X-App-Token": "test" })),
}));

vi.mock("../utils/syncGeminiKeyToBackend", () => ({
  resolveGeminiApiKeyFromSettings: vi.fn(() => "AIza-test-key"),
  syncGeminiKeyToBackend: vi.fn(async () => true),
}));

vi.mock("../desktopClient", () => ({
  desktopClient: {
    getVoiceStatus: vi.fn(),
  },
}));

const baseSettings = {} as AppSettings;

describe("ensureVoiceBackendReady", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { desktopClient } = await import("../desktopClient");
    vi.mocked(desktopClient.getVoiceStatus).mockReset();
  });

  it("returns offline when backendOnline is false", async () => {
    const result = await ensureVoiceBackendReady(baseSettings, { backendOnline: false });
    expect(result).toEqual({ ready: false, reason: "offline" });
  });

  it("returns ready when voice status is already configured (skips sync)", async () => {
    const { desktopClient } = await import("../desktopClient");
    const { syncGeminiKeyToBackend } = await import("../utils/syncGeminiKeyToBackend");
    vi.mocked(desktopClient.getVoiceStatus).mockResolvedValueOnce({
      ready: true,
      model: "gemini-live",
    });

    const result = await ensureVoiceBackendReady(baseSettings, { backendOnline: true });
    expect(result).toEqual({ ready: true, model: "gemini-live" });
    expect(syncGeminiKeyToBackend).not.toHaveBeenCalled();
  });

  it("returns ready when sync fails but backend already has the key", async () => {
    const { desktopClient } = await import("../desktopClient");
    const { syncGeminiKeyToBackend } = await import("../utils/syncGeminiKeyToBackend");
    vi.mocked(desktopClient.getVoiceStatus)
      .mockResolvedValueOnce({ ready: false, model: "" })
      .mockResolvedValueOnce({ ready: true, model: "gemini-live" });
    vi.mocked(syncGeminiKeyToBackend).mockRejectedValueOnce(new Error("HTTP 401"));

    const result = await ensureVoiceBackendReady(baseSettings, { backendOnline: true });
    expect(result).toEqual({ ready: true, model: "gemini-live" });
  });

  it("returns ready when sync and status succeed", async () => {
    const { desktopClient } = await import("../desktopClient");
    vi.mocked(desktopClient.getVoiceStatus)
      .mockResolvedValueOnce({ ready: false, model: "" })
      .mockResolvedValueOnce({ ready: true, model: "gemini-live" });

    const result = await ensureVoiceBackendReady(baseSettings, { backendOnline: true });
    expect(result).toEqual({ ready: true, model: "gemini-live" });
  });

  it("assertVoiceBackendReady throws user-facing message", async () => {
    const { resolveGeminiApiKeyFromSettings } = await import("../utils/syncGeminiKeyToBackend");
    vi.mocked(resolveGeminiApiKeyFromSettings).mockReturnValueOnce("");

    await expect(assertVoiceBackendReady(baseSettings)).rejects.toThrow(
      voiceBackendNotReadyMessage({ ready: false, reason: "missing_key" }),
    );
  });
});
