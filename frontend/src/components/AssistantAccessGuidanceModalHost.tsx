import { useEffect, useState } from "react";
import {
  ASSISTANT_ACCESS_GUIDANCE_MODAL_DISMISSED_SESSION_KEY,
  ASSISTANT_ACCESS_GUIDANCE_PROMPT_EVENT,
} from "../constants";
import type { CalendarAccessGuidanceFocus } from "../systemCommands/assistantAccessGuidance";
import ModalShell from "./ModalShell";
import { MODAL_FOOTER_ROW_CLASS, OUTLINE_PILL_BTN_CLASS, PRIMARY_BTN_CLASS } from "../utils/styles";
import { useI18n } from "../i18n/I18nContext";

interface AssistantAccessGuidanceModalHostProps {
  onOpenAssistantSettings: () => void;
  onOpenExternalSources: () => void;
}

type GuidanceFocus = Exclude<CalendarAccessGuidanceFocus, "master">;

/**
 * Contextual modal when calendar/mail integration failed due to permissions, provider scope, or accounts.
 * Master “assistant actions” off is handled by {@link AssistantPermissionsModalHost}.
 */
export default function AssistantAccessGuidanceModalHost({
  onOpenAssistantSettings,
  onOpenExternalSources,
}: AssistantAccessGuidanceModalHostProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<GuidanceFocus | null>(null);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ focus?: GuidanceFocus; force?: boolean }>).detail;
      const f = detail?.focus;
      if (!f) return;
      const force = detail?.force === true;
      if (!force) {
        try {
          if (sessionStorage.getItem(ASSISTANT_ACCESS_GUIDANCE_MODAL_DISMISSED_SESSION_KEY) === "1") return;
        } catch {
          /* ignore */
        }
      }
      setFocus(f);
      setOpen(true);
    };
    window.addEventListener(ASSISTANT_ACCESS_GUIDANCE_PROMPT_EVENT, handler);
    return () => window.removeEventListener(ASSISTANT_ACCESS_GUIDANCE_PROMPT_EVENT, handler);
  }, []);

  const handleDismiss = () => {
    setOpen(false);
    setFocus(null);
    try {
      sessionStorage.setItem(ASSISTANT_ACCESS_GUIDANCE_MODAL_DISMISSED_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const handleAssistantSettings = () => {
    setOpen(false);
    setFocus(null);
    onOpenAssistantSettings();
  };

  const handleExternalSources = () => {
    setOpen(false);
    setFocus(null);
    onOpenExternalSources();
  };

  if (!open || !focus) return null;

  const title =
    focus === "read_integration"
      ? t("assistant.accessGuidanceTitleRead")
      : focus === "provider_scope"
        ? t("assistant.accessGuidanceTitleProviders")
        : t("assistant.accessGuidanceTitleAccounts");

  const body =
    focus === "read_integration"
      ? t("assistant.accessGuidanceBodyRead")
      : focus === "provider_scope"
        ? t("assistant.accessGuidanceBodyProviders")
        : t("assistant.accessGuidanceBodyAccounts");

  const isAccounts = focus === "accounts_api";

  return (
    <ModalShell
      title={title}
      onClose={handleDismiss}
      maxWidthClass="max-w-lg"
      footer={
        <div
          className={`${MODAL_FOOTER_ROW_CLASS} flex-col-reverse justify-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end`}
        >
          <button
            type="button"
            className={`${OUTLINE_PILL_BTN_CLASS} min-h-10 w-full shrink-0 px-4 py-2.5 sm:w-auto`}
            onClick={handleDismiss}
          >
            {t("assistant.accessGuidanceNotNow")}
          </button>
          {isAccounts ? (
            <>
              <button
                type="button"
                className={`${OUTLINE_PILL_BTN_CLASS} min-h-10 w-full shrink-0 px-4 py-2.5 sm:w-auto`}
                onClick={handleAssistantSettings}
              >
                {t("assistant.accessGuidanceOpenAssistantSettings")}
              </button>
              <button
                type="button"
                className={`${PRIMARY_BTN_CLASS} min-h-10 w-full shrink-0 sm:w-auto`}
                onClick={handleExternalSources}
              >
                {t("assistant.accessGuidanceOpenExternalSources")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${PRIMARY_BTN_CLASS} min-h-10 w-full shrink-0 sm:w-auto`}
              onClick={handleAssistantSettings}
            >
              {t("assistant.accessGuidanceOpenAssistantSettings")}
            </button>
          )}
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-text-primary">{body}</p>
    </ModalShell>
  );
}
