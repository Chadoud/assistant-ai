import { z } from "zod";
import type { ChatProviderId } from "../types/settings";
import { API_BASE, getApiHeaders } from "./client";
import { requestValidated } from "./client";
import { apiKeyForBackendRequest } from "../utils/geminiConnection";

export interface StartCodegenSessionOptions {
  goal: string;
  provider?: ChatProviderId;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  followUp?: boolean;
  priorSessionId?: string;
}

const StartCodegenSessionResponseSchema = z.object({
  session_id: z.string(),
  project_path: z.string(),
});

/** Start a Codegen Studio session; returns session id for SSE progress. */
export function startCodegenSession({
  goal,
  provider = "ollama",
  model = "",
  apiKey = "",
  baseUrl = "",
  followUp = false,
  priorSessionId,
}: StartCodegenSessionOptions): Promise<{ session_id: string; project_path: string }> {
  return requestValidated("/codegen/session", StartCodegenSessionResponseSchema, {
    method: "POST",
    body: JSON.stringify({
      goal,
      provider,
      model: model.trim() || null,
      api_key: provider === "ollama" ? "" : apiKeyForBackendRequest(apiKey),
      base_url: provider === "custom" ? baseUrl : "",
      follow_up: followUp,
      prior_session_id: followUp && priorSessionId ? priorSessionId : null,
    }),
  });
}

const CodegenPreviewResponseSchema = z.object({
  ok: z.boolean(),
  preview_url: z.string().optional(),
  stack_label: z.string().optional(),
  project_path: z.string().optional(),
});

export function reportCodegenPreview(
  sessionId: string,
  previewUrl: string,
  logTail = ""
): Promise<z.infer<typeof CodegenPreviewResponseSchema>> {
  return requestValidated(`/codegen/session/${sessionId}/preview`, CodegenPreviewResponseSchema, {
    method: "POST",
    body: JSON.stringify({ preview_url: previewUrl, log_tail: logTail }),
  });
}

export function cancelCodegenSession(sessionId: string): Promise<{ ok: boolean }> {
  return requestValidated(`/codegen/session/${sessionId}`, z.object({ ok: z.boolean() }), {
    method: "DELETE",
  });
}

const CodegenRepairResponseSchema = z.object({
  ok: z.boolean(),
  changed: z.array(z.string()).optional(),
  count: z.number().optional(),
  error: z.string().optional(),
  /** Repair touched dependency manifests — the rerun must not skip install. */
  needs_install: z.boolean().optional(),
  strategy: z.enum(["deterministic", "llm"]).optional(),
  error_class: z.string().optional(),
  packages: z.array(z.string()).optional(),
  budget_exhausted: z.boolean().optional(),
});

export type CodegenRepairResponse = z.infer<typeof CodegenRepairResponseSchema>;

/** Ask the backend to self-correct a broken build by regenerating the failing files. */
export function repairCodegenSession(
  sessionId: string,
  error: string,
  logTail = ""
): Promise<CodegenRepairResponse> {
  return requestValidated(`/codegen/session/${sessionId}/repair`, CodegenRepairResponseSchema, {
    method: "POST",
    body: JSON.stringify({ error, log_tail: logTail }),
  });
}

const CodegenSessionStatusSchema = z.object({
  session_id: z.string(),
  goal: z.string(),
  status: z.string(),
  project_path: z.string().nullable(),
  preview_url: z.string().nullable(),
  stack_label: z.string().nullable(),
  install_command: z.string().nullable(),
  dev_command: z.string().nullable(),
  files_written: z.number(),
  error: z.string().nullable(),
  log_tail: z.string(),
  plan_steps: z.array(z.object({ title: z.string(), kind: z.string() })).optional(),
  repair_attempts: z.number().optional(),
});

type CodegenSessionStatus = z.infer<typeof CodegenSessionStatusSchema>;

export function fetchCodegenSessionStatus(sessionId: string): Promise<CodegenSessionStatus> {
  return requestValidated(`/codegen/session/${sessionId}/status`, CodegenSessionStatusSchema);
}

function codegenEventsUrl(sessionId: string): string {
  return `${API_BASE}/codegen/session/${sessionId}`;
}

export async function openCodegenEventStream(
  sessionId: string,
  signal: AbortSignal,
  onFrame: (frame: Record<string, unknown>) => void
): Promise<void> {
  const headers = await getApiHeaders();
  const res = await fetch(codegenEventsUrl(sessionId), { headers, signal });
  if (!res.ok || !res.body) {
    throw new Error(`Codegen stream failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onFrame(JSON.parse(line.slice(6)) as Record<string, unknown>);
      } catch {
        /* ignore malformed */
      }
    }
  }
}
