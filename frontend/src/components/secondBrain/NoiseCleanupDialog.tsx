import ModalShell from "../ModalShell";
import { MODAL_FOOTER_ROW_CLASS } from "../../utils/styles";
import type { CleanupSecondBrainNoiseResult } from "../../api/memory";
import { useI18n } from "../../i18n/I18nContext";

interface Props {
  open: boolean;
  preview: CleanupSecondBrainNoiseResult | null;
  isPreviewing: boolean;
  isRunning: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function previewBody(
  t: (key: string, vars?: Record<string, string | number>) => string,
  preview: CleanupSecondBrainNoiseResult | null,
): string {
  if (!preview) return "";
  const memoryCount = preview.memories.candidates ?? 0;
  const taskCount = preview.tasks.candidates ?? 0;
  const convCount =
    (preview.conversations?.candidates_delete ?? 0) +
    (preview.conversations?.candidates_archive ?? 0);
  if (memoryCount === 0 && taskCount === 0 && convCount === 0) {
    return t("cleanup.previewNone");
  }
  if (convCount > 0 && memoryCount === 0 && taskCount === 0) {
    return t("cleanup.previewChatsOnly", { n: convCount });
  }
  if (convCount > 0) {
    return t("cleanup.previewWithChats", {
      memories: memoryCount,
      tasks: taskCount,
      conversations: convCount,
    });
  }
  if (memoryCount > 0 && taskCount > 0) {
    return t("cleanup.previewBoth", { memories: memoryCount, tasks: taskCount });
  }
  if (memoryCount > 0) return t("cleanup.previewMemoriesOnly", { n: memoryCount });
  return t("cleanup.previewTasksOnly", { n: taskCount });
}

export default function NoiseCleanupDialog({
  open,
  preview,
  isPreviewing,
  isRunning,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  if (!open) return null;

  const canConfirm = !isPreviewing && !isRunning && (preview?.total_candidates ?? 0) > 0;

  return (
    <ModalShell
      title={t("cleanup.title")}
      onClose={onClose}
      footer={
        <div className={`${MODAL_FOOTER_ROW_CLASS} flex gap-2`}>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
          >
            {t("cleanup.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={!canConfirm}
            className="flex-1 rounded-lg bg-button-primary py-2 text-sm font-medium text-white hover:bg-button-hover disabled:opacity-50"
          >
            {isRunning ? t("cleanup.removing") : t("cleanup.confirm")}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-text-secondary">
        {isPreviewing ? t("cleanup.previewLoading") : previewBody(t, preview)}
      </p>
    </ModalShell>
  );
}
