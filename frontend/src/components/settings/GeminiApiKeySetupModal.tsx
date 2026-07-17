import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppSettings } from "../../types/settings";
import ModalShell from "../ModalShell";
import GeminiApiKeySetupGuide from "./GeminiApiKeySetupGuide";
import { useI18n } from "../../i18n/I18nContext";
import { PRIMARY_BTN_CLASS, SECONDARY_BTN_CLASS } from "../../utils/styles";
import { buildGeminiChatSettingsPatch, commitGeminiChatSetup } from "../../utils/geminiChatSetup";
import { isGeminiKeyFormatPlausible, normalizeGeminiApiKey } from "../../utils/geminiApiKey";
import { resolveGeminiApiKeyDraftFromSettings } from "../../utils/syncGeminiKeyToBackend";

interface GeminiApiKeySetupModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
}

/** In-app Gemini API key setup — used from chat when cloud AI is not configured yet. */
export default function GeminiApiKeySetupModal({
  open,
  onClose,
  settings,
  onSettingsPatch,
}: GeminiApiKeySetupModalProps) {
  const { t } = useI18n();
  const [draftKey, setDraftKey] = useState("");
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraftKey(resolveGeminiApiKeyDraftFromSettings(settings));
    }
    wasOpenRef.current = open;
  }, [open, settings]);

  const handleSave = useCallback(async () => {
    const normalized = normalizeGeminiApiKey(draftKey);
    if (!isGeminiKeyFormatPlausible(normalized)) return;

    setSaving(true);
    try {
      const merged = { ...settings, geminiApiKey: normalized };
      const patch = buildGeminiChatSettingsPatch(merged);
      if (patch) onSettingsPatch(patch);
      await commitGeminiChatSetup({ ...merged, ...patch }, onSettingsPatch);
      onClose();
    } catch {
      toast.error(t("settings.geminiSetupSyncFailed"));
    } finally {
      setSaving(false);
    }
  }, [draftKey, onClose, onSettingsPatch, settings, t]);

  if (!open) return null;

  const keyReady = isGeminiKeyFormatPlausible(draftKey);

  return (
    <ModalShell title={t("settings.geminiSetupModalTitle")} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-5 px-5 pb-5 pt-2 sm:px-6">
        <p className="text-sm leading-relaxed text-muted">{t("settings.geminiSetupModalIntro")}</p>
        <GeminiApiKeySetupGuide
          apiKey={draftKey}
          onApiKeyChange={setDraftKey}
          inputId="gemini-api-key-modal"
        />
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className={SECONDARY_BTN_CLASS}>
            {t("settings.models.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!keyReady || saving}
            className={PRIMARY_BTN_CLASS}
          >
            {saving ? t("common.loading") : t("settings.geminiSetupModalSave")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
