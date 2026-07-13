import { useCallback, useEffect, useRef } from "react";
import { createInitialDoubleClapState, processDoubleClapSample } from "../voice/doubleClapEngine";

/** ~33 Hz — fast enough for clap peaks; cheaper than 60 Hz rAF-equivalent. */
const CLAP_SAMPLE_INTERVAL_MS = 30;

function isE2eScenario(): boolean {
  try {
    return sessionStorage.getItem("__exositesDevScenario") === "e2e";
  } catch {
    return false;
  }
}

/**
 * Monitors the microphone for two sharp transients (hand claps) in quick succession.
 *
 * When `enabled`, opens a dedicated, low-processing mic stream (no echo cancellation /
 * AGC so claps stay sharp) and samples its level on a timer. The timer (not rAF) keeps
 * detection alive while the window is hidden/minimized, which is what lets a double-clap
 * bring the app forward from the background.
 *
 * @param options.enabled       Whether to listen. Toggling off fully releases the mic.
 * @param options.onDoubleClap  Invoked once per detected double-clap (cooldown-guarded).
 */
export function useDoubleClapWake(options: {
  enabled: boolean;
  onDoubleClap: () => void;
}): void {
  const { enabled, onDoubleClap } = options;
  const onDoubleClapRef = useRef(onDoubleClap);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    onDoubleClapRef.current = onDoubleClap;
  }, [onDoubleClap]);

  const unlockAudioContext = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (ctx?.state === "suspended") {
      void ctx.resume().catch(() => {
        /* needs a user gesture on macOS — retried on pointerdown/keydown */
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("pointerdown", unlockAudioContext, { passive: true });
    window.addEventListener("keydown", unlockAudioContext);
    return () => {
      window.removeEventListener("pointerdown", unlockAudioContext);
      window.removeEventListener("keydown", unlockAudioContext);
    };
  }, [enabled, unlockAudioContext]);

  useEffect(() => {
    if (!enabled || isE2eScenario()) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;

    cancelledRef.current = false;

    const releaseCapture = () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      void audioCtxRef.current?.close().catch(() => {
        /* ignore */
      });
      audioCtxRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const start = async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        return;
      }
      if (cancelledRef.current || !stream) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      unlockAudioContext();

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      const buf = new Float32Array(analyser.fftSize);
      let engine = createInitialDoubleClapState();

      const tick = () => {
        if (cancelledRef.current) return;
        unlockAudioContext();
        if (audioCtx.state === "suspended") return;

        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();

        const { state: next, doubleClap } = processDoubleClapSample(engine, now, rms);
        engine = next;
        if (doubleClap) {
          // Release the clap-only mic before the voice session opens its own stream.
          releaseCapture();
          onDoubleClapRef.current();
        }
      };

      intervalRef.current = setInterval(tick, CLAP_SAMPLE_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        unlockAudioContext();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    void start();

    return () => {
      cancelledRef.current = true;
      document.removeEventListener("visibilitychange", onVisibility);
      releaseCapture();
    };
  }, [enabled, unlockAudioContext]);
}
