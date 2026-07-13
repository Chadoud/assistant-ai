/**
 * Mutable mic/playback metrics for voice-reactive visuals — updated on a timer,
 * read imperatively by Tesseract RAF (no React state per tick).
 */

import { FREQ_BAND_COUNT } from "../hooks/voiceAudio";

/** Live analyser snapshot — mutate in place from the voice audio timer. */
export interface VoiceVisualMetrics {
  amplitude: number;
  frequencyBands: number[];
}

/** Empty metrics for session start / teardown. */
export function createEmptyVoiceVisualMetrics(): VoiceVisualMetrics {
  return {
    amplitude: 0,
    frequencyBands: Array(FREQ_BAND_COUNT).fill(0),
  };
}

/** Reset metrics without allocating a new bands array. */
export function resetVoiceVisualMetrics(metrics: VoiceVisualMetrics): void {
  metrics.amplitude = 0;
  metrics.frequencyBands.fill(0);
}
