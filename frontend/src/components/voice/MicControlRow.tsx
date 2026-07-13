import type { AppSettings } from "../../types/settings";
import type { UseVoiceSessionReturn } from "../../hooks/useVoiceSession";
import { useI18n } from "../../i18n/I18nContext";
import { VoiceMicSettingsPopover } from "./VoiceMicSettingsPopover";
import { VoiceMicIssueBanner } from "./VoiceMicIssueBanner";
import { isPushToTalkMode, isPttVoiceUiActive } from "../../utils/voiceInteractionUi";

interface MicControlRowProps {
  voice: UseVoiceSessionReturn;
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  voiceReady?: boolean | null;
  onOpenAiProviderSettings?: () => void;
  onOpenFullVoiceSettings?: () => void;
  layout: "exo" | "composer";
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
      />
    </svg>
  );
}

/**
 * Mic toggle (conversation) or PTT hints, plus the mic settings gear on the same row.
 */
export function MicControlRow({
  voice,
  settings,
  onSettingsPatch,
  voiceReady,
  onOpenAiProviderSettings,
  onOpenFullVoiceSettings,
  layout,
}: MicControlRowProps) {
  const { t } = useI18n();
  const isPtt = isPushToTalkMode(settings);
  const pttUiActive = isPtt && isPttVoiceUiActive(voice);
  const isExoRail = layout === "exo";
  const notConfigured = voiceReady === false;

  const settingsPopover = (
    <VoiceMicSettingsPopover
      settings={settings}
      onSettingsPatch={onSettingsPatch}
      voice={voice}
      voiceReady={voiceReady}
      onOpenAiProviderSettings={onOpenAiProviderSettings}
      onOpenFullVoiceSettings={onOpenFullVoiceSettings}
      placement={isExoRail ? "above" : "above"}
      triggerVariant={isExoRail ? "rail" : "composer"}
    />
  );

  if (isPtt) {
    if (isExoRail) {
      return (
        <div className="flex items-center gap-1.5">
          {pttUiActive ? (
            <button
              type="button"
              onClick={() => {
                voice.stop();
                voice.dismissError();
              }}
              className="exo-action-btn min-w-0 flex-1"
            >
              {t("voice.pttEndSession")}
            </button>
          ) : (
            <p className="min-w-0 flex-1 px-0.5 text-center text-xs leading-snug text-muted">
              {t("voice.pttExoHint", { key: settings.pttShortcut.displayLabel })}
            </p>
          )}
          {settingsPopover}
        </div>
      );
    }

    return (
      <div className="flex shrink-0 items-center gap-1">
        {pttUiActive ? (
          <button
            type="button"
            onClick={() => {
              voice.stop();
              voice.dismissError();
            }}
            className="rounded-xl border border-border bg-bg-secondary px-2.5 py-2.5 text-2xs font-medium text-text-primary transition-colors hover:bg-hover-overlay"
          >
            {t("voice.pttEndSession")}
          </button>
        ) : null}
        {settingsPopover}
      </div>
    );
  }

  const micTitle = voice.isListening
    ? t("voice.micStopTitle")
    : notConfigured
      ? t("voice.micNotConfiguredTitle")
      : t("voice.micStartTitle");

  const toggleMic = () => {
    if (voice.isListening || voice.isReconnecting) {
      voice.stop();
      voice.dismissError();
    } else {
      void voice.start();
    }
  };

  const retryVoice = () => {
    voice.stop();
    voice.dismissError();
    void voice.start();
  };

  if (isExoRail) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMic}
            className={`exo-action-btn min-w-0 flex-1 ${voice.isListening || voice.isReconnecting ? "exo-action-btn--active" : ""}`}
            title={t("voice.micShortcutTitle")}
          >
            {voice.isListening
              ? t("voice.micOnLabel")
              : voice.isReconnecting
                ? t("voice.micReconnectingLabel")
                : t("voice.micOffLabel")}
          </button>
          {settingsPopover}
        </div>
        <VoiceMicIssueBanner
          voice={voice}
          onOpenAiProviderSettings={onOpenAiProviderSettings}
          onRetryVoice={retryVoice}
        />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="relative">
        <button
          type="button"
          onClick={toggleMic}
          title={micTitle}
          aria-label={micTitle}
          disabled={notConfigured && !voice.isListening}
          className={`rounded-xl border p-2.5 transition-colors ${
            voice.isListening
              ? "border-red-500 bg-red-950/50 text-red-400 hover:bg-red-950"
              : notConfigured
                ? "border-border bg-bg-secondary text-text-muted opacity-50 cursor-not-allowed"
                : "border-border bg-bg-secondary text-text-secondary hover:bg-hover-overlay"
          }`}
        >
          <MicIcon className="h-4 w-4" />
        </button>
        {notConfigured && !voice.isListening ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
        ) : null}
      </div>
      {settingsPopover}
    </div>
  );
}
