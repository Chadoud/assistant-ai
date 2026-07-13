import type { WorkspaceVoiceBatchTrigger } from "../../../components/queue/workspaceBatchLogic";

export type WorkspaceRunBatchFn = (opts?: WorkspaceVoiceBatchTrigger) => Promise<void>;

/**
 * Narrow bridge between assistant voice tools and the workspace sort pipeline.
 * Workspace registers **Run sort**; assistant triggers it without holding queue internals.
 */
export interface WorkspaceAssistantBridge {
  registerRunBatch: (fn: WorkspaceRunBatchFn | null) => void;
  triggerRunBatch: (opts?: WorkspaceVoiceBatchTrigger) => Promise<void>;
}

/** Stable bridge instance — one per app shell lifetime. */
export function createWorkspaceAssistantBridge(): WorkspaceAssistantBridge {
  let runner: WorkspaceRunBatchFn | null = null;
  return {
    registerRunBatch(fn) {
      runner = fn;
    },
    async triggerRunBatch(opts) {
      if (runner) await runner(opts);
    },
  };
}
