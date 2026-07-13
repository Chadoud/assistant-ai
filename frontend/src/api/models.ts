import { z } from "zod";
import { desktopClient } from "../desktopClient";
import { extractApiError, getApiHeaders, mapFetchFailureToError, request, requestValidated } from "./client";

const VisionStatusSchema = z.object({
  installed_vision_models: z.array(z.string()),
  auto_model: z.string().nullable(),
  resolved: z.string().nullable(),
});

const SortStatusSchema = z.object({
  classify_model: z.string(),
  vision_model: z.string().nullable(),
  installed_text_models: z.array(z.string()),
  installed_vision_models: z.array(z.string()),
  installed_embed_models: z.array(z.string()),
});

export type SortStatusResponse = z.infer<typeof SortStatusSchema>;

const ModelStoragePartialSchema = z.object({
  group_id: z.string(),
  digest_prefix: z.string(),
  total_bytes: z.number(),
  file_count: z.number(),
  /** Model refs from local manifests whose layers reference this digest (may be empty). */
  related_models: z.array(z.string()).optional(),
});

const ModelStorageSchema = z.object({
  ollama_home: z.string(),
  partials: z.array(ModelStoragePartialSchema),
  total_partial_bytes: z.number(),
  prune_cli_available: z.boolean(),
});

const DeletePartialResponseSchema = z.object({
  success: z.literal(true),
  files_removed: z.number(),
  bytes_freed: z.number(),
});

const OllamaPruneResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

export type ModelStoragePartial = z.infer<typeof ModelStoragePartialSchema>;
export type ModelStorageResponse = z.infer<typeof ModelStorageSchema>;

export const modelsApi = {
  models: () => request<{ models: string[] }>("/models"),

  visionStatus: (preferred?: string) => {
    const q =
      preferred !== undefined && preferred !== ""
        ? `?preferred=${encodeURIComponent(preferred)}`
        : "";
    return requestValidated(`/vision/status${q}`, VisionStatusSchema);
  },

  sortStatus: (preferred?: string, visionPreferred?: string) => {
    const params = new URLSearchParams();
    if (preferred?.trim()) params.set("preferred", preferred.trim());
    if (visionPreferred?.trim()) params.set("vision_preferred", visionPreferred.trim());
    const q = params.toString() ? `?${params.toString()}` : "";
    return requestValidated(`/sort/status${q}`, SortStatusSchema);
  },

  pullModel: async (
    model: string,
    onProgress?: (pct: number, status: string) => void,
    signal?: AbortSignal
  ): Promise<{ success: boolean; model: string; models: string[] }> => {
    let res: Response;
    try {
      res = await desktopClient.fetch("/models/pull", {
        method: "POST",
        headers: await getApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ model }),
        signal,
      });
    } catch (e: unknown) {
      throw mapFetchFailureToError(e);
    }
    if (!res.ok) throw new Error(await extractApiError(res));

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finalModels: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (data.status === "error") {
          throw new Error(typeof data.error === "string" ? data.error : "Pull failed");
        }
        if (data.status === "done") {
          finalModels = Array.isArray(data.models) ? (data.models as string[]) : [];
        } else if (onProgress) {
          const total = typeof data.total === "number" ? data.total : 0;
          const completed = typeof data.completed === "number" ? data.completed : 0;
          const pct = total > 0 ? Math.min(99, Math.round((completed / total) * 100)) : -1;
          onProgress(pct, typeof data.status === "string" ? data.status : "");
        }
      }
    }

    return { success: true, model, models: finalModels };
  },

  deleteModel: (model: string) =>
    request<{ success: boolean; models: string[] }>(`/models/${encodeURIComponent(model)}`, {
      method: "DELETE",
    }),

  getModelStorage: () => requestValidated("/models/storage", ModelStorageSchema),

  deletePartialBlobs: (digest_prefix: string) =>
    requestValidated("/models/storage/partial", DeletePartialResponseSchema, {
      method: "DELETE",
      body: JSON.stringify({ digest_prefix }),
    }),

  ollamaPrune: () =>
    requestValidated("/models/storage/prune", OllamaPruneResponseSchema, { method: "POST" }),
};
