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
}

const StartAgentTaskResponseSchema = z.object({ task_id: z.string() });

/** Start an autonomous agent task; returns the backend task id for SSE progress. */
export function startAgentTask({
  goal,
  provider = "ollama",
  model = "",
  apiKey = "",
  baseUrl = "",
}: StartAgentTaskOptions): Promise<{ task_id: string }> {
  return requestValidated("/agent/task", StartAgentTaskResponseSchema, {
    method: "POST",
    body: JSON.stringify({
      goal,
      provider,
      model: model.trim() || null,
      api_key: provider === "ollama" ? "" : apiKeyForBackendRequest(apiKey),
      base_url: provider === "custom" ? baseUrl : "",
    }),
  });
}
