/**
 * Voice-reactive Tesseract CSS animation playback rate — pure helpers for RAF.
 */

import type { VoiceStatus } from "../components/ExoPanelChrome";
import type { VoiceVisualMetrics } from "./voiceVisualMetrics";

export interface VoiceTesseractDrive {
  metrics: VoiceVisualMetrics;
  voiceStatus: VoiceStatus;
  landBlend: number;
  outputTranscript: string;
  introPlaybackRate: number;
}

const PLAYBACK_SMOOTH_ALPHA = 0.22;

/** Target animation rate from voice session state (before landing blend). */
export function voicePlaybackTarget(
  voiceStatus: VoiceStatus,
  amplitude: number,
  outputTranscript: string,
): number {
  switch (voiceStatus) {
    case "IDLE":
      return 0.05;
    case "ACTIVE":
      return 0.12;
    case "RECONNECTING":
      return 0.1;
    case "LISTENING":
      return Math.max(0.32, 0.38 + amplitude * 5.2);
    case "SPEAKING": {
      const streamBoost = Math.min(0.14, outputTranscript.length * 0.0018);
      return 0.26 + streamBoost;
    }
    default:
      return 0.08;
  }
}

/** Low-pass toward the blended landing + voice target rate. */
export function stepSmoothedPlaybackRate(
  smoothed: number,
  voiceStatus: VoiceStatus,
  amplitude: number,
  outputTranscript: string,
  landBlend: number,
  introPlaybackRate: number,
): number {
  const voiceTarget = voicePlaybackTarget(voiceStatus, amplitude, outputTranscript);
  const target = landBlend * voiceTarget + (1 - landBlend) * introPlaybackRate;
  return smoothed + PLAYBACK_SMOOTH_ALPHA * (target - smoothed);
}

/** Apply playback rate to all CSS animations under a root element. */
export function applyCssAnimationPlaybackRate(
  root: HTMLElement,
  rate: number,
  lastAppliedRef: { value: number },
): void {
  const clamped = Math.max(0.05, rate);
  if (Math.abs(clamped - lastAppliedRef.value) < 0.008) return;
  lastAppliedRef.value = clamped;
  root.getAnimations({ subtree: true }).forEach((anim) => {
    anim.playbackRate = clamped;
  });
}
