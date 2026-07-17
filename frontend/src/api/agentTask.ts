import { z } from "zod";
import type { ChatProviderId } from "../types/settings";
import { requestValidated } from "./client";
import { apiKeyForBackendRequest } from "../utils/geminiConnection";

interface StartAgentTaskOptions {
  goal: string;
  provider?: ChatProviderId;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  /** Same as voice autonomousMode — allows SENSITIVE non-APPROVAL tools. */
  autonomousMode?: boolean;
}

const StartAgentTaskResponseSchema = z.object({ task_id: z.string() });
const OkSchema = z.object({ ok: z.boolean() });

/** Start an autonomous agent task; returns the backend task id for SSE progress. */
export function startAgentTask({
  goal,
  provider = "ollama",
  model = "",
  apiKey = "",
  baseUrl = "",
  autonomousMode = false,
}: StartAgentTaskOptions): Promise<{ task_id: string }> {
  return requestValidated("/agent/task", StartAgentTaskResponseSchema, {
    method: "POST",
    body: JSON.stringify({
      goal,
      provider,
      model: model.trim() || null,
      api_key: provider === "ollama" ? "" : apiKeyForBackendRequest(apiKey),
      base_url: provider === "custom" ? baseUrl : "",
      autonomous_mode: autonomousMode,
    }),
  });
}

/** Approve a pending APPROVAL-tier tool for a running agent task (voice-parity consent). */
export async function approveAgentTaskTool(
  taskId: string,
  callId: string,
  scope: "once" | "session" = "once",
): Promise<void> {
  await requestValidated(`/agent/task/${encodeURIComponent(taskId)}/approve`, OkSchema, {
    method: "POST",
    body: JSON.stringify({ call_id: callId, scope }),
  });
}

/** Deny a pending APPROVAL-tier tool for a running agent task. */
export async function denyAgentTaskTool(taskId: string, callId: string): Promise<void> {
  await requestValidated(`/agent/task/${encodeURIComponent(taskId)}/deny`, OkSchema, {
    method: "POST",
    body: JSON.stringify({ call_id: callId }),
  });
}
