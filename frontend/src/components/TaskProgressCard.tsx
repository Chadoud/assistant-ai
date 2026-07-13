/**
 * TaskProgressCard — textual progress for an autonomous agent task.
 *
 * Renders as a special message bubble in AssistantChatPanel when an agent_task
 * is submitted. Subscribes to the shared {@link planStore} (which owns the single
 * SSE connection per task — see planStore for why a single consumer is required)
 * and progressively shows the planning phase, each step + subtask with status
 * icons, and the final result summary.
 */

import { useCallback, useState } from "react";
import { usePlanStream } from "../features/assistant/plan/usePlanStream";
import { cancelPlanTask } from "../features/assistant/plan/planStore";
import type { CubeStatus } from "../features/assistant/plan/planStore";

interface Props {
  taskId: string;
  goal: string;
}

/** Plain-language summary for common planner failures (raw API dumps are hard to read). */
function formatTaskError(error: string): string {
  if (error.includes("RESOURCE_EXHAUSTED") || /\b429\b/.test(error)) {
    return (
      "Gemini API quota exceeded for the autonomous task planner. " +
      "Autonomous tasks use Gemini even when chat is set to another provider. " +
      "Check your Google AI billing and rate limits, or try again in about a minute."
    );
  }
  return error;
}

export default function TaskProgressCard({ taskId, goal }: Props) {
  const plan = usePlanStream(taskId);
  const [copied, setCopied] = useState(false);

  const cancel = useCallback(() => {
    void cancelPlanTask(taskId);
  }, [taskId]);

  const phase = plan?.phase ?? "planning";
  const steps = plan?.steps ?? [];
  const finalResult = plan?.finalResult ?? null;
  const taskError = plan?.error ?? null;
  const cancelled = phase === "cancelled";
  const planning = phase === "planning";
  const isDone = phase === "complete" || phase === "error" || phase === "cancelled";

  const copyResult = useCallback(() => {
    if (!finalResult) return;
    void navigator.clipboard.writeText(finalResult).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [finalResult]);

  return (
    <div className="w-full min-w-0 max-w-full rounded-2xl border border-zinc-700/60 bg-zinc-900/70 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-0.5">
            Autonomous task
          </p>
          <p className="text-sm text-zinc-200 leading-snug line-clamp-2">{goal}</p>
        </div>
        {!isDone && (
          <button
            onClick={cancel}
            className="shrink-0 text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Planning */}
      {planning && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <SpinnerIcon />
            {plan?.relayNotice ?? "Planning steps…"}
          </div>
        </div>
      )}

      {/* Step list */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div key={step.index} className="space-y-1">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0">
                  <StatusIcon status={step.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs leading-snug ${
                      step.status === "pending" ? "text-zinc-500" : "text-zinc-300"
                    }`}
                  >
                    {step.description}
                  </p>
                </div>
              </div>
              {step.subtasks.length > 0 && (
                <div className="ml-6 space-y-1 border-l border-zinc-800 pl-2.5">
                  {step.subtasks.map((sub) => (
                    <div key={sub.index} className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">
                        <StatusIcon status={sub.status} small />
                      </div>
                      <p
                        className={`text-[11px] leading-snug ${
                          sub.status === "pending" ? "text-zinc-600" : "text-zinc-400"
                        }`}
                      >
                        {sub.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Final result */}
      {finalResult && (
        <div className="rounded-xl bg-zinc-800/60 px-3 py-2.5 space-y-2">
          <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
            {finalResult}
          </p>
          <button
            onClick={copyResult}
            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            {copied ? (
              <>
                <CheckIcon /> Copied
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy result
              </>
            )}
          </button>
        </div>
      )}

      {taskError && (
        <p
          className="text-xs text-red-400 bg-red-950/40 px-3 py-2 rounded-lg break-words [overflow-wrap:anywhere]"
          title={taskError.length > 120 ? taskError : undefined}
        >
          {formatTaskError(taskError)}
        </p>
      )}

      {cancelled && <p className="text-xs text-zinc-500">Task cancelled.</p>}
    </div>
  );
}

function StatusIcon({ status, small = false }: { status: CubeStatus; small?: boolean }) {
  if (status === "running") return <SpinnerIcon small={small} />;
  if (status === "done") return <CheckIcon small={small} />;
  if (status === "error") return <ErrorIcon small={small} />;
  return <DotIcon small={small} />;
}

function SpinnerIcon({ small = false }: { small?: boolean }) {
  const cls = small ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <svg className={`${cls} text-accent animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon({ small = false }: { small?: boolean }) {
  const cls = small ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <svg className={`${cls} text-green-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ErrorIcon({ small = false }: { small?: boolean }) {
  const cls = small ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <svg className={`${cls} text-red-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DotIcon({ small = false }: { small?: boolean }) {
  const box = small ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <div className={`${box} flex items-center justify-center`}>
      <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
    </div>
  );
}
