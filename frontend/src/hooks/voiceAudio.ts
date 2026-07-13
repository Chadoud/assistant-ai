/**
 * Audio primitives for the voice session: PCM analysis helpers and the
 * streaming playback engine. Extracted from `useVoiceSession` because none of
 * this touches React — it is pure DOM/WebAudio and is independently testable.
 */

import { toast } from "sonner";

/** lib.dom types require `Uint8Array<ArrayBuffer>`; constructed buffers satisfy this at runtime. */
export function asAnalyserByteBuffer(buf: Uint8Array): Uint8Array<ArrayBuffer> {
  return buf as Uint8Array<ArrayBuffer>;
}

/** RMS (0–1) of one Int16 PCM frame; used to detect the user talking over the AI. */
export function rmsOfInt16Pcm(buffer: ArrayBuffer): number {
  const samples = new Int16Array(buffer);
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const normalized = samples[i] / 32768;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / samples.length);
}

const FREQ_BAND_EDGES = [0, 2, 5, 10, 20, 40, 80, 140, 256] as const;
export const FREQ_BAND_COUNT = FREQ_BAND_EDGES.length - 1;

/** Maps an FFT byte buffer (AnalyserNode) to 8 normalised log bands (0–1). */
export function bandsFromFreqBytes(freqArray: Uint8Array): number[] {
  const bands: number[] = [];
  for (let b = 0; b < FREQ_BAND_COUNT; b++) {
    const lo = FREQ_BAND_EDGES[b];
    const hi = FREQ_BAND_EDGES[b + 1];
    let bandSum = 0;
    for (let i = lo; i < hi; i++) bandSum += freqArray[i];
    bands.push(bandSum / ((hi - lo) * 255));
  }
  return bands;
}

// ── StreamingAudioPlayer ─────────────────────────────────────────────────────

/**
 * Plays Int16 PCM audio (24 kHz, mono) sent as base-64 chunks from the backend.
 *
 * One persistent AudioContext is kept alive for the duration of the session. Each
 * incoming chunk is decoded and scheduled to start exactly when the previous one
 * ends — eliminating the 20–50 ms init gap caused by creating a new AudioContext
 * per chunk.
 *
 * resetCursor() may be called between turns once playback has fully drained — it
 * must not run while buffers are still scheduled or the echo gate opens too early.
 */
export class StreamingAudioPlayer {
  private readonly ctx: AudioContext;
  /** When false, `close()` must not tear down a shared capture context. */
  private readonly ownsContext: boolean;
  private readonly analyser: AnalyserNode;
  private readonly freqScratch: Uint8Array;
  private nextStartTime = 0;
  /** Scheduled-but-not-finished sources, so a barge-in can stop them instantly. */
  private readonly active = new Set<AudioBufferSourceNode>();

  /**
   * @param sharedContext Re-use the mic capture `AudioContext` so Chromium can
   *   correlate playback with the mic for echo cancellation (macOS/Electron).
   */
  constructor(sharedContext?: AudioContext) {
    this.ctx = sharedContext ?? new AudioContext({ sampleRate: 24_000 });
    this.ownsContext = sharedContext === undefined;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.45;
    const binCount = this.analyser.frequencyBinCount;
    this.freqScratch = new Uint8Array(binCount);
    this.analyser.connect(this.ctx.destination);
  }

  /**
   * Spectrum of AI playback (24 kHz graph). Same 8-band layout as the mic analyser;
   * merge with mic bands using Math.max per band for visuals.
   */
  getFrequencyBands(): number[] {
    this.analyser.getByteFrequencyData(asAnalyserByteBuffer(this.freqScratch));
    return bandsFromFreqBytes(this.freqScratch);
  }

  enqueue(b64: string): void {
    try {
      if (this.ctx.state === "suspended") {
        void this.ctx.resume();
      }

      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

      const buffer = this.ctx.createBuffer(1, float32.length, 24_000);
      buffer.copyToChannel(float32, 0);

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.analyser);
      this.active.add(src);
      src.onended = () => this.active.delete(src);

      const startAt = Math.max(this.ctx.currentTime, this.nextStartTime);
      src.start(startAt);
      this.nextStartTime = startAt + buffer.duration;
    } catch (e) {
      // Non-fatal — log but do not interrupt the session.
      console.warn("[StreamingAudioPlayer] enqueue error:", e);
      toast.error("Voice playback failed", {
        description: e instanceof Error ? e.message : "Could not play AI audio.",
        duration: 5_000,
      });
    }
  }

  /**
   * Whether AI audio is still audible — i.e. scheduled playback has not yet
   * finished. `hangoverSec` extends the window past the last buffer end to let
   * residual speaker output settle before the mic is re-opened.
   */
  isOutputActive(hangoverSec = 0): boolean {
    if (this.active.size > 0) return true;
    return this.ctx.currentTime < this.nextStartTime + hangoverSec;
  }

  /** Reset scheduling cursor after playback has drained so the next turn starts cleanly. */
  resetCursor(): void {
    if (this.active.size > 0) return;
    this.nextStartTime = this.ctx.currentTime;
  }

  /**
   * Immediately stop all scheduled/playing audio (barge-in / interruption).
   * Playback is buffered ahead of real time, so on an interrupt we must cut the
   * already-queued tail or the AI keeps talking for seconds after the user spoke.
   */
  flush(): void {
    for (const src of this.active) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        /* already stopped — ignore */
      }
    }
    this.active.clear();
    this.nextStartTime = this.ctx.currentTime;
  }

  /** Call when the browser un-hides the page so playback recovers after background throttling. */
  resumePlaybackIfSuspended(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  close(): void {
    this.flush();
    if (this.ownsContext) {
      void this.ctx.close();
    }
  }
}
