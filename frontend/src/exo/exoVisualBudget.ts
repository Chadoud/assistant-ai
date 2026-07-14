/**
 * Exo visual power budget — when the CSS-3D tesseract may spend GPU/Renderer.
 *
 * Policy: keep the tesseract **alive** while Exo is focused and visible;
 * freeze only when off-tab, document hidden, or the window is in the background.
 * Pure policy; React wiring lives in useExoVisualBudget.
 */

export type ExoVisualBudgetState = "RUNNING" | "HIDDEN_SUSPENDED";

/** Voice statuses that need the 20 Hz mic spectrum analyser (not idle CSS alone). */
export const EXO_MOTION_VOICE_STATUSES = [
  "LISTENING",
  "SPEAKING",
  "ACTIVE",
  "RECONNECTING",
] as const;

export type ExoMotionVoiceStatus = (typeof EXO_MOTION_VOICE_STATUSES)[number] | "IDLE" | string;

type ExoVisualBudgetInput = {
  /** Off-tab, page hidden, or main window unfocused. */
  hidden: boolean;
};

export function voiceStatusNeedsMotion(voiceStatus: ExoMotionVoiceStatus): boolean {
  return (EXO_MOTION_VOICE_STATUSES as readonly string[]).includes(voiceStatus);
}

/**
 * Tesseract CSS/RAF: run whenever visible+focused; freeze in background.
 */
export function resolveExoVisualBudget(input: ExoVisualBudgetInput): ExoVisualBudgetState {
  return input.hidden ? "HIDDEN_SUSPENDED" : "RUNNING";
}

/**
 * Mic spectrum poll: only while voice is live **and** the visual is on-screen.
 * Idle focused Exo keeps CSS alive without the 20 Hz analyser.
 */
export function shouldSuspendVoiceAnalyser(input: {
  hidden: boolean;
  voiceStatus: ExoMotionVoiceStatus;
}): boolean {
  if (input.hidden) return true;
  return !voiceStatusNeedsMotion(input.voiceStatus);
}

export function isExoVisualBudgetDebugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("exoDebugVisualBudget") === "1";
  } catch {
    return false;
  }
}
