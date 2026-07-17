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
  resolveGeminiApiKeyFromSettings: vi.fn(() => "AIzaSy0123456789012345678901234567890"),
  syncGeminiKeyToBackend: vi.fn(async () => true),
}));

vi.mock("../utils/geminiConnection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/geminiConnection")>();
  return {
    ...actual,
    isGeminiConnectedInSettings: vi.fn(() => true),
  };
});

vi.mock("../desktopClient", () => ({
  desktopClient: {
    getVoiceStatus: vi.fn(),
  },
}));

const baseSettings = {} as AppSettings;

describe("ensureVoiceBackendReady", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("window", { electronAPI: undefined });
    const { desktopClient } = await import("../desktopClient");
    const { isGeminiConnectedInSettings } = await import("../utils/geminiConnection");
    const { resolveGeminiApiKeyFromSettings, syncGeminiKeyToBackend } = await import(
      "../utils/syncGeminiKeyToBackend"
    );
    vi.mocked(desktopClient.getVoiceStatus).mockReset();
    vi.mocked(isGeminiConnectedInSettings).mockReturnValue(true);
    vi.mocked(resolveGeminiApiKeyFromSettings).mockReturnValue("AIzaSy0123456789012345678901234567890");
    vi.mocked(syncGeminiKeyToBackend).mockResolvedValue(true);
  });

  it("returns offline when backendOnline is false", async () => {
    const result = await ensureVoiceBackendReady(baseSettings, { backendOnline: false });
    expect(result).toEqual({ ready: false, reason: "offline" });
  });

  it("returns missing_key when Settings and vault both lack Gemini", async () => {
    const { desktopClient } = await import("../desktopClient");
    const { isGeminiConnectedInSettings } = await import("../utils/geminiConnection");
    const { syncGeminiKeyToBackend } = await import("../utils/syncGeminiKeyToBackend");
    vi.mocked(isGeminiConnectedInSettings).mockReturnValue(false);
    vi.stubGlobal("electronAPI", undefined);
    vi.stubGlobal("window", { electronAPI: undefined });

    const result = await ensureVoiceBackendReady(baseSettings, { backendOnline: true });
    expect(result).toEqual({ ready: false, reason: "missing_key" });
    expect(syncGeminiKeyToBackend).not.toHaveBeenCalled();
    expect(desktopClient.getVoiceStatus).not.toHaveBeenCalled();
  });

  it("returns ready when vault has Gemini but Settings mask is not hydrated yet", async () => {
    const { desktopClient } = await import("../desktopClient");
    const { isGeminiConnectedInSettings } = await import("../utils/geminiConnection");
    const { syncGeminiKeyToBackend } = await import("../utils/syncGeminiKeyToBackend");
    vi.mocked(isGeminiConnectedInSettings).mockReturnValue(false);
    vi.stubGlobal("window", {
      electronAPI: { hasSecret: vi.fn(async () => true) },
    });
    vi.mocked(desktopClient.getVoiceStatus).mockResolvedValue({
      ready: true,
      model: "gemini-live",
    });

    const result = await ensureVoiceBackendReady(baseSettings, { backendOnline: true });
    expect(result).toEqual({ ready: true, model: "gemini-live" });
    expect(syncGeminiKeyToBackend).not.toHaveBeenCalled();
  });

  it("returns ready when Settings is connected and voice status is already configured (skips sync)", async () => {
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
    const { isGeminiConnectedInSettings } = await import("../utils/geminiConnection");
    vi.mocked(isGeminiConnectedInSettings).mockReturnValue(false);

    await expect(assertVoiceBackendReady(baseSettings)).rejects.toThrow(
      voiceBackendNotReadyMessage({ ready: false, reason: "missing_key" }),
    );
  });
});
