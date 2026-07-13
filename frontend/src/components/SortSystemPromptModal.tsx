import { useEffect, useState } from "react";
import ModalShell from "./ModalShell";
import { MODAL_FOOTER_ROW_CLASS, PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "../utils/styles";
import { fetchSortPromptDefault } from "../api/sortPromptMeta";
import { useI18n } from "../i18n/I18nContext";
import { useCloudSortActive } from "../hooks/useCloudSortActive";

interface SortSystemPromptModalProps {
  open: boolean;
  onClose: () => void;
  initialValue: string;
  onSave: (value: string) => void;
  backendOnline: boolean;
}

/**
 * Modal to view the built-in sort system prompt and optionally set a custom override (persisted in app settings).
 */
export default function SortSystemPromptModal({
  open,
  onClose,
  initialValue,
  onSave,
  backendOnline,
}: SortSystemPromptModalProps) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive();
  const [draft, setDraft] = useState(initialValue);
  const [builtin, setBuiltin] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(initialValue);
    setLoadErr(null);
    setShowReference(false);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open || !backendOnline) {
      if (!open) setBuiltin(null);
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const d = await fetchSortPromptDefault();
        if (!cancel) setBuiltin(d);
      } catch (e: unknown) {
        if (!cancel) {
          setLoadErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, backendOnline]);

  if (!open) return null;

  const footerSecondaryClass = `${SECONDARY_BTN_CLASS} flex flex-1 basis-0 min-h-[2.75rem] min-w-[6rem] items-center justify-center px-3 text-center leading-snug`;
  const footerPrimaryClass = `${PRIMARY_BTN_CLASS} flex-1 basis-0 min-h-[2.75rem] min-w-[6rem]`;

  return (
    <ModalShell
      title={t("queue.sortPromptModalTitle")}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      footer={
        <div className={`${MODAL_FOOTER_ROW_CLASS} flex flex-wrap items-stretch justify-end gap-3`}>
          <button type="button" className={footerSecondaryClass} onClick={onClose}>
            {t("queue.sortPromptClose")}
          </button>
          <button type="button" className={footerSecondaryClass} onClick={() => setDraft("")}>
            {t("queue.sortPromptUseBuiltin")}
          </button>
          {builtin ? (
            <button type="button" className={footerSecondaryClass} onClick={() => setDraft(builtin)}>
              {t("queue.sortPromptLoadDefault")}
            </button>
          ) : null}
          <button type="button" className={footerPrimaryClass} onClick={() => onSave(draft)}>
            {t("queue.sortPromptSave")}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-text-primary">
        <p className="text-muted leading-snug">
          {t(cloudSortActive ? "queue.sortPromptModalHelpCloud" : "queue.sortPromptModalHelp")}
        </p>
        {loadErr ? (
          <p className="text-xs text-warning" role="status">
            {t("queue.sortPromptBuiltinLoadError", { message: loadErr })}
          </p>
        ) : null}
        {builtin ? (
          <div>
            <button
              type="button"
              className="text-accent text-xs font-medium hover:underline"
              onClick={() => setShowReference((s) => !s)}
            >
              {showReference ? t("queue.sortPromptHideBuiltin") : t("queue.sortPromptShowBuiltin")}
            </button>
            {showReference ? (
              <pre className="mt-2 p-3 rounded-lg bg-bg-secondary border border-border text-2xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                {builtin}
              </pre>
            ) : null}
          </div>
        ) : null}
        <label className="block">
          <span className="sr-only">{t("queue.sortPromptEditorLabel")}</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            className="w-full min-h-[220px] rounded-lg border border-border bg-bg-primary px-3 py-2 font-mono text-2xs leading-relaxed text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            spellCheck={false}
          />
        </label>
      </div>
    </ModalShell>
  );
}
