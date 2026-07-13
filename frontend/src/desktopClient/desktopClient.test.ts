import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopClient } from "./index";

vi.mock("../api/client", () => ({
  API_BASE: "http://127.0.0.1:8765",
  getApiHeaders: vi.fn(async (extra?: Record<string, string>) => ({
    "X-App-Token": "test-token",
    ...(extra ?? {}),
  })),
  mapFetchFailureToError: vi.fn((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
}));

describe("DesktopClient", () => {
  const client = new DesktopClient();

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it("fetch attaches API_BASE, auth headers, and extra headers", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({ ok: true } as Response);

    await client.fetch("/health", { headers: { Accept: "application/json" } });

    expect(global.fetch).toHaveBeenCalledWith("http://127.0.0.1:8765/health", {
      headers: {
        "X-App-Token": "test-token",
        Accept: "application/json",
      },
    });
  });

  it("getHealth returns parsed body on success", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    } as Response);

    await expect(client.getHealth()).resolves.toEqual({ status: "ok" });
  });

  it("getHealth throws when response is not ok", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    await expect(client.getHealth()).rejects.toThrow("Health check failed: HTTP 503");
  });

  it("getVoiceStatus returns null when response is not ok", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    await expect(client.getVoiceStatus()).resolves.toBeNull();
  });

  it("getVoiceStatus returns parsed body on success", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ready: true, model: "gemini-live", missing: [] }),
    } as Response);

    await expect(client.getVoiceStatus()).resolves.toEqual({
      ready: true,
      model: "gemini-live",
      missing: [],
    });
  });

  it("postAiSetKey sends JSON body and throws on error", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid key" }),
    } as Response);

    await expect(
      client.postAiSetKey({ provider: "gemini", api_key: "AIza-test" }),
    ).rejects.toThrow("invalid key");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/ai/set-key",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          base_url: "",
          provider: "gemini",
          api_key: "AIza-test",
          gemini_api_key: "AIza-test",
        }),
      }),
    );
  });

  it("getAiStatus returns null when response is not ok", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 502 } as Response);

    await expect(client.getAiStatus()).resolves.toBeNull();
  });
});
