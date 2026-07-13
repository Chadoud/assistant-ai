import type { UseVoiceSessionReturn } from "../../hooks/useVoiceSession";
import { useI18n } from "../../i18n/I18nContext";
import { userFacingErrorDetail } from "../../utils/userGuidance";

interface VoiceMicIssueBannerProps {
  voice: UseVoiceSessionReturn;
  onOpenAiProviderSettings?: () => void;
  onRetryVoice?: () => void;
}

/**
 * Inline voice failure banner for the Exo mic row.
 * Shown while listening or reconnecting so quota and transport errors are not silent.
 */
export function VoiceMicIssueBanner({
  voice,
  onOpenAiProviderSettings,
  onRetryVoice,
}: VoiceMicIssueBannerProps) {
  const { t } = useI18n();

  if (!voice.error) return null;

  const { detail, hint } = userFacingErrorDetail(new Error(voice.error));
  const showAiSettings = voice.errorActionId === "settings:ai-provider" && onOpenAiProviderSettings;
  const showRetry = !showAiSettings && onRetryVoice && (voice.isListening || voice.isReconnecting);

  return (
    <div
      className="exo-voice-error flex flex-col gap-2 rounded-lg border-2 border-[#dc2626] bg-white px-2.5 py-2 shadow-sm"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-2xs leading-snug">
          <p className="font-semibold text-[#dc2626]">{detail}</p>
          {hint ? <p className="mt-1 text-[#991b1b]">{hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={voice.dismissError}
          className="shrink-0 rounded p-0.5 text-[#991b1b] hover:bg-red-50 hover:text-[#dc2626]"
          aria-label={t("assistant.dismissError")}
        >
          {"\u00d7"}
        </button>
      </div>
      {(showAiSettings || showRetry) && (
        <div className="flex flex-wrap gap-2">
          {showAiSettings ? (
            <button
              type="button"
              onClick={onOpenAiProviderSettings}
              className="text-2xs whitespace-nowrap rounded bg-[#dc2626] px-2 py-1 font-medium text-white hover:bg-[#b91c1c]"
            >
              {t("voice.issueOpenAiSettings")}
            </button>
          ) : null}
          {showRetry ? (
            <button
              type="button"
              onClick={onRetryVoice}
              className="text-2xs whitespace-nowrap rounded bg-[#dc2626] px-2 py-1 font-medium text-white hover:bg-[#b91c1c]"
            >
              {t("voice.issueRetryVoice")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
