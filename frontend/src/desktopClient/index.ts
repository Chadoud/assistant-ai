import { API_BASE, getApiHeaders, mapFetchFailureToError } from "../api/client";
import type { ChatProviderId } from "../types/settings";

type VoiceStatusResponse = {
  ready: boolean;
  model: string;
  missing?: string[];
};

type HealthResponse = {
  status: string;
};

type AiProviderStatusEntry = {
  ready: boolean;
  label?: string;
  needs_key?: boolean;
  needs_base_url?: boolean;
  supports_tools?: boolean;
  is_local?: boolean;
  default_models?: string[];
};

type AiStatusResponse = {
  gemini?: { ready: boolean; chat_model?: string };
  ollama?: { ready: boolean };
  providers?: Record<string, AiProviderStatusEntry>;
};

type SetKeyPayload = {
  provider: ChatProviderId | string;
  api_key: string;
  base_url?: string;
  gemini_api_key?: string;
};

/**
 * Thin facade for desktop → local backend HTTP calls.
 * Centralizes API_BASE, auth headers, and common endpoint shapes.
 */
export class DesktopClient {
  /** Low-level fetch with API_BASE and X-App-Token headers. */
  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const extra = (init?.headers as Record<string, string> | undefined) ?? {};
    const headers = await getApiHeaders(extra);
    try {
      return await fetch(`${API_BASE}${path}`, { ...init, headers });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw mapFetchFailureToError(e);
    }
  }

  /** GET /health — backend liveness probe. */
  async getHealth(): Promise<HealthResponse> {
    const res = await this.fetch("/health");
    if (!res.ok) {
      throw new Error(`Health check failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<HealthResponse>;
  }

  /** GET /voice/status — whether GEMINI_API_KEY is configured for voice. */
  async getVoiceStatus(): Promise<VoiceStatusResponse | null> {
    const res = await this.fetch("/voice/status");
    if (!res.ok) return null;
    return res.json() as Promise<VoiceStatusResponse>;
  }

  /** GET /ai/status — per-provider readiness badges. */
  async getAiStatus(): Promise<AiStatusResponse | null> {
    const res = await this.fetch("/ai/status");
    if (!res.ok) return null;
    return res.json() as Promise<AiStatusResponse>;
  }

  /** POST /ai/set-key — persist a provider key to backend env/.env. */
  async postAiSetKey(payload: SetKeyPayload): Promise<void> {
    const res = await this.fetch("/ai/set-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_url: "",
        ...payload,
        gemini_api_key: payload.gemini_api_key ?? (payload.provider === "gemini" ? payload.api_key : ""),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
  }

  /** POST /sort/desktop-defaults — mirror Sort-tab settings for voice-triggered sorts. */
  async postSortDesktopDefaults(body: Record<string, unknown>): Promise<void> {
    const res = await this.fetch("/sort/desktop-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { detail?: unknown; error?: string };
      throw new Error(errBody.error ?? `HTTP ${res.status}`);
    }
  }

  /** GET /meta/sort-prompt-default — built-in classify system prompt. */
  async getSortPromptDefault(): Promise<string> {
    const res = await this.fetch("/meta/sort-prompt-default");
    if (!res.ok) {
      throw new Error(`Sort prompt fetch failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { default?: string };
    if (typeof body.default !== "string") {
      throw new Error("Invalid sort prompt response");
    }
    return body.default;
  }

  /** GET /v1/public/client-config — telemetry / client bootstrap config. */
  async getClientConfig(): Promise<Record<string, unknown>> {
    const res = await this.fetch("/v1/public/client-config");
    if (!res.ok) {
      throw new Error(`Client config fetch failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  /** GET /gmail/status — Gmail OAuth connection state. */
  async getGmailStatus(): Promise<Record<string, unknown>> {
    const res = await this.fetch("/gmail/status");
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  /** POST /integration/token-relay — push OAuth token to backend for voice/tools. */
  async postIntegrationTokenRelay(body: {
    provider_id: string;
    token: string;
    expires_in: number;
  }): Promise<void> {
    const res = await this.fetch("/integration/token-relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Token relay failed: HTTP ${res.status}`);
    }
  }

  /** GET /ai/routing — model routing configuration. */
  async getAiRouting(): Promise<Record<string, unknown>> {
    const res = await this.fetch("/ai/routing");
    if (!res.ok) {
      throw new Error(`AI routing fetch failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  /** POST /v1/crash-reports — backend crash ingest (when enabled). */
  async postCrashReport(body: string, extraHeaders?: Record<string, string>): Promise<Response> {
    return this.fetch("/v1/crash-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body,
    });
  }

  /** POST JSON to an agent task endpoint. */
  async postAgentTask(taskId: string, body: unknown, init?: RequestInit): Promise<Response> {
    return this.fetch(`/agent/task/${encodeURIComponent(taskId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...init,
    });
  }

  /** DELETE an agent task. */
  async deleteAgentTask(taskId: string): Promise<Response> {
    return this.fetch(`/agent/task/${encodeURIComponent(taskId)}`, { method: "DELETE" });
  }
}

export const desktopClient = new DesktopClient();
