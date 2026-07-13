import type { AppSettings } from "../types/settings";

type PttVoiceActivity = {
  isPttCapturing: boolean;
  isReconnecting: boolean;
  inputTranscript?: string;
  outputTranscript?: string;
  toolPhaseLabel?: string | null;
  pendingToolApproval?: unknown | null;
};

/** True when the user chose push-to-talk in settings. */
export function isPushToTalkMode(settings: Pick<AppSettings, "voiceInteractionMode">): boolean {
  return settings.voiceInteractionMode === "pushToTalk";
}

/** Mic is open for a PTT turn (hold-to-talk or double-tap locked mode). */
export function isPttMicOpen(voice: Pick<PttVoiceActivity, "isPttCapturing">): boolean {
  return voice.isPttCapturing;
}

/**
 * Whether the shell should show an active PTT voice surface (HUD, end-session control, live status).
 * A warm WebSocket alone does not count — only capture, reconnect, or an in-flight turn does.
 */
export function isPttVoiceUiActive(voice: PttVoiceActivity): boolean {
  return (
    voice.isPttCapturing ||
    voice.isReconnecting ||
    Boolean(voice.inputTranscript?.trim()) ||
    Boolean(voice.outputTranscript?.trim()) ||
    Boolean(voice.toolPhaseLabel?.trim()) ||
    voice.pendingToolApproval != null
  );
}
