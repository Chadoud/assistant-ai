import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppSettings } from "../types/settings";
import {
  ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY,
  ASSISTANT_PERMISSIONS_PROMPT_EVENT,
} from "../constants";
import ModalShell from "./ModalShell";
import { MODAL_FOOTER_ROW_CLASS } from "../utils/styles";
import { useI18n } from "../i18n/I18nContext";

interface AssistantPermissionsModalHostProps {
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  /** When true, never auto-open the first-run assistant actions prompt. */
  blocked?: boolean;
  onJumpToAssistantSettings: () => void;
}

/**
 * First-run / blocked-flow modal when assistant actions are off — opened from the Assistant tab or from tool bridge.
 */
export default function AssistantPermissionsModalHost({
  settings,
  setSettings,
  blocked = false,
  onJumpToAssistantSettings,
}: AssistantPermissionsModalHostProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const enabledRef = useRef(settings.assistantToolsEnabled);
  enabledRef.current = settings.assistantToolsEnabled;

  useEffect(() => {
    const onPrompt = (ev: Event) => {
      const detail = (ev as CustomEvent<{ force?: boolean }>).detail;
      const force = detail?.force === true;
      if (enabledRef.current) return;
      if (blocked && !force) return;
      if (!force) {
        try {
          if (sessionStorage.getItem(ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY) === "1") return;
        } catch {
          /* ignore */
        }
      }
      setOpen(true);
    };
    window.addEventListener(ASSISTANT_PERMISSIONS_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(ASSISTANT_PERMISSIONS_PROMPT_EVENT, onPrompt);
  }, [blocked]);

  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);

  useEffect(() => {
    if (settings.assistantToolsEnabled) {
      setOpen(false);
      try {
        sessionStorage.removeItem(ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [settings.assistantToolsEnabled]);

  const handleDismissPrompt = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const handleOpenSettingsFromModal = () => {
    setOpen(false);
    onJumpToAssistantSettings();
  };

  const handleAllow = () => {
    setSettings((s) => ({ ...s, assistantToolsEnabled: true }));
    try {
      sessionStorage.removeItem(ASSISTANT_PERMISSION_MODAL_DISMISSED_SESSION_KEY);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <ModalShell
      title={t("assistant.permissionModalTitle")}
      onClose={handleDismissPrompt}
      maxWidthClass="max-w-lg"
      footer={
        <div className={`${MODAL_FOOTER_ROW_CLASS} justify-end gap-2`}>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-hover-overlay"
            onClick={handleDismissPrompt}
          >
            {t("assistant.permissionModalNotNow")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-button-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            onClick={handleAllow}
          >
            {t("assistant.permissionModalAllow")}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-text-primary">{t("assistant.permissionModalBody")}</p>
        <button
          type="button"
          className="text-sm font-medium text-accent underline-offset-2 hover:underline"
          onClick={handleOpenSettingsFromModal}
        >
          {t("assistant.permissionModalOpenSettings")}
        </button>
      </div>
    </ModalShell>
  );
}
