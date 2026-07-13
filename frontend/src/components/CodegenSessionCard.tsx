import { useI18n } from "../i18n/I18nContext";
import { setRailTab, useCodegenState, type CodegenPhase } from "../features/codegen/codegenStore";

interface CodegenSessionCardProps {
  sessionId: string;
  goal: string;
}

function cardStatusLabel(t: (k: string) => string, phase: CodegenPhase, error: string | null): string {
  switch (phase) {
    case "ready":
      return t("assistant.codegen.cardReady");
    case "error":
      return error ?? t("assistant.codegen.phaseError");
    case "installing":
      return t("assistant.codegen.phaseInstalling");
    case "starting":
      return t("assistant.codegen.phaseStarting");
    case "generating":
      return t("assistant.codegen.phaseGenerating");
    case "cancelled":
      return t("assistant.codegen.phaseCancelled");
    default:
      return t("assistant.codegen.cardWorking");
  }
}

/** In-chat progress card for an active Codegen Studio build. */
export default function CodegenSessionCard({ sessionId, goal }: CodegenSessionCardProps) {
  const { t } = useI18n();
  const state = useCodegenState(sessionId);

  const phase = state?.phase ?? "generating";
  const files = state?.filesWritten ?? 0;
  const isActive = phase !== "ready" && phase !== "error" && phase !== "cancelled";

  return (
    <div className="w-full max-w-full min-w-0 rounded-xl border border-border bg-bg-secondary px-3 py-3 text-sm">
      <p className="font-medium text-text-primary">{t("assistant.codegen.cardTitle")}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted">{goal}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          {isActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />}
          {cardStatusLabel(t, phase, state?.error ?? null)}
        </span>
        {files > 0 && <span>{t("assistant.codegen.filesWritten", { count: files })}</span>}
        {state?.stackLabel && (
          <span className="rounded bg-bg-primary px-1.5 py-0.5 text-2xs">{state.stackLabel}</span>
        )}
      </div>
      <button
        type="button"
        className="mt-3 text-xs text-accent hover:underline"
        onClick={() => setRailTab("preview")}
      >
        {phase === "ready" ? t("assistant.codegen.openPreviewReady") : t("assistant.codegen.openPreview")}
      </button>
    </div>
  );
}
