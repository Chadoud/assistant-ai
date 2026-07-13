import type { AppSettings } from "../types/settings";
import type { VoiceInteractionMode } from "../types/voiceInteraction";

/** Voice session surface needed when interaction mode changes. */
export interface VoiceSessionForSettingsSideEffects {
  isListening: boolean;
  isReconnecting: boolean;
  stop: () => void;
  dismissError: () => void;
}

/**
 * Stop an active voice session when the user switches conversation ↔ push-to-talk.
 * PTT wiring is handled separately in `usePushToTalk`.
 */
export function stopVoiceIfModeChanged(
  previousMode: VoiceInteractionMode,
  nextMode: VoiceInteractionMode,
  voice: VoiceSessionForSettingsSideEffects,
): void {
  if (previousMode === nextMode) return;
  if (voice.isListening || voice.isReconnecting) {
    voice.stop();
  }
  voice.dismissError();
}

/**
 * Apply a settings patch, stopping voice when `voiceInteractionMode` changes.
 */
export function patchVoiceSettings(
  settings: AppSettings,
  patch: Partial<AppSettings>,
  onSettingsPatch: (patch: Partial<AppSettings>) => void,
  voice?: VoiceSessionForSettingsSideEffects,
): void {
  if (patch.voiceInteractionMode && voice) {
    stopVoiceIfModeChanged(
      settings.voiceInteractionMode,
      patch.voiceInteractionMode,
      voice,
    );
  }
  onSettingsPatch(patch);
}
