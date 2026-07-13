/**
 * Mic capture, AudioWorklet PCM forwarding, echo gate, and barge-in for voice sessions.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { MicPreRollBuffer } from "../hooks/micPreRollBuffer";
import {
  FREQ_BAND_COUNT,
  StreamingAudioPlayer,
  asAnalyserByteBuffer,
  bandsFromFreqBytes,
  rmsOfInt16Pcm,
} from "../hooks/voiceAudio";
import { isApplePlatform } from "../utils/platform";
import {
  createEmptyVoiceVisualMetrics,
  resetVoiceVisualMetrics,
  type VoiceVisualMetrics,
} from "./voiceVisualMetrics";
import { VOICE_CAPTURE_WORKLET_URL } from "../constants";
import { logAppDiagnostic } from "../utils/appDiagnosticLog";

/** Extra time the mic stays muted after scheduled playback ends (room/speaker tail). */
const ECHO_TAIL_HANGOVER_SEC = isApplePlatform() ? 1.25 : 0.55;

/** On Mac, treat the whole AI-speaking window as echo-sensitive for barge-in. */
const MAC_STRICT_ECHO_BARGE_IN = isApplePlatform();

/** Barge-in while the model is still streaming chunks (before playback drain). */
const BARGE_IN_RMS = 0.08;
const BARGE_IN_SUSTAIN_FRAMES = 3;

/** During buffered playback, speaker echo often exceeds normal speech RMS (Mac worst). */
const BARGE_IN_RMS_DURING_PLAYBACK = isApplePlatform() ? 0.34 : 0.22;
const BARGE_IN_SUSTAIN_DURING_PLAYBACK = isApplePlatform() ? 14 : 8;

/** ~64 ms per worklet chunk at 16 kHz — keep ~3 s on Mac (echo hangover + barge-in). */
const MIC_PRE_ROLL_MAX_CHUNKS = isApplePlatform() ? 48 : 32;

/** Refs shared with {@link voiceFrameRouter} for speaking state and playback control. */
interface VoiceAudioFrameRouterRefs {
  isSpeaking: RefObject<boolean>;
  bargeInActive: RefObject<boolean>;
  bargeInPending: RefObject<boolean>;
  bargeInFrameCount: RefObject<number>;
  micPreRoll: MicPreRollBuffer;
  wasGatingMic: RefObject<boolean>;
  audioPlayer: RefObject<StreamingAudioPlayer | null>;
}

interface UseVoiceAudioOptions {
  /** Set by the WebSocket hook once OAuth tokens are relayed — gates outbound PCM. */
  tokensRelayedRef: RefObject<boolean>;
  /**
   * When true, skip the 20 Hz analyser poll (Tesseract-only metrics).
   * Mic capture and barge-in still use the AudioWorklet path.
   */
  visualAnalysisSuspendedRef?: RefObject<boolean>;
}

interface UseVoiceAudioReturn {
  streamRef: RefObject<MediaStream | null>;
  micMutedRef: RefObject<boolean>;
  frameRouterRefs: VoiceAudioFrameRouterRefs;
  /** Mutable mic spectrum — updated ~20 Hz; read from refs/RAF, not React state. */
  visualMetricsRef: MutableRefObject<VoiceVisualMetrics>;
  isPttCapturing: boolean;
  startCapture: () => Promise<void>;
  teardown: () => void;
  attachPcmForwarder: (ws: WebSocket) => void;
  setMicCaptureEnabled: (enabled: boolean) => void;
  beginPttCaptureWarmup: () => void;
  resetForSessionStart: () => void;
  resetOnWsClose: () => void;
  resetBargeIn: () => void;
  flushPlayback: () => void;
  clearMicPreRoll: () => void;
  resetAmplitudeVisuals: () => void;
  setPttCapturing: (capturing: boolean) => void;
}

/**
 * Manage mic hardware, worklet capture, echo suppression, and barge-in detection.
 */
export function useVoiceAudio(options: UseVoiceAudioOptions): UseVoiceAudioReturn {
  const { tokensRelayedRef, visualAnalysisSuspendedRef } = options;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const amplitudeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micMutedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const bargeInActiveRef = useRef(false);
  const bargeInPendingRef = useRef(false);
  const bargeInFrameCountRef = useRef(0);
  const micPreRollRef = useRef(new MicPreRollBuffer(MIC_PRE_ROLL_MAX_CHUNKS));
  const wasGatingMicRef = useRef(false);
  /** True from PTT key-down until mic is unmuted — buffer audio during WS/token warmup. */
  const pttWarmCaptureRef = useRef(false);

  const visualMetricsRef = useRef<VoiceVisualMetrics>(createEmptyVoiceVisualMetrics());
  const [isPttCapturing, setIsPttCapturing] = useState(false);

  const frameRouterRefs: VoiceAudioFrameRouterRefs = {
    isSpeaking: isSpeakingRef,
    bargeInActive: bargeInActiveRef,
    bargeInPending: bargeInPendingRef,
    bargeInFrameCount: bargeInFrameCountRef,
    micPreRoll: micPreRollRef.current,
    wasGatingMic: wasGatingMicRef,
    audioPlayer: audioPlayerRef,
  };

  const resetBargeIn = useCallback(() => {
    isSpeakingRef.current = false;
    bargeInActiveRef.current = false;
    bargeInPendingRef.current = false;
    bargeInFrameCountRef.current = 0;
  }, []);

  const clearMicPreRoll = useCallback(() => {
    micPreRollRef.current.clear();
    wasGatingMicRef.current = false;
  }, []);

  const resetAmplitudeVisuals = useCallback(() => {
    resetVoiceVisualMetrics(visualMetricsRef.current);
  }, []);

  const stopAmplitudePoll = useCallback(() => {
    if (amplitudeTimerRef.current) {
      clearInterval(amplitudeTimerRef.current);
      amplitudeTimerRef.current = null;
    }
    resetVoiceVisualMetrics(visualMetricsRef.current);
  }, []);

  const startAmplitudePoll = useCallback(() => {
    if (amplitudeTimerRef.current || !analyserRef.current) return;
    const analyser = analyserRef.current;
    const timeDomainArray = new Uint8Array(analyser.fftSize);
    const freqArray = new Uint8Array(analyser.frequencyBinCount);
    amplitudeTimerRef.current = setInterval(() => {
      if (visualAnalysisSuspendedRef?.current) {
        resetVoiceVisualMetrics(visualMetricsRef.current);
        return;
      }
      const metrics = visualMetricsRef.current;
      analyser.getByteTimeDomainData(asAnalyserByteBuffer(timeDomainArray));
      let sum = 0;
      for (const v of timeDomainArray) sum += Math.abs(v - 128);
      metrics.amplitude = Math.min(1, sum / timeDomainArray.length / 32);

      analyser.getByteFrequencyData(asAnalyserByteBuffer(freqArray));
      const micBands = bandsFromFreqBytes(freqArray);
      const player = audioPlayerRef.current;
      if (player) {
        const outBands = player.getFrequencyBands();
        for (let i = 0; i < FREQ_BAND_COUNT; i++) {
          metrics.frequencyBands[i] = Math.max(micBands[i] ?? 0, outBands[i] ?? 0);
        }
      } else {
        for (let i = 0; i < FREQ_BAND_COUNT; i++) {
          metrics.frequencyBands[i] = micBands[i] ?? 0;
        }
      }
    }, 50);
  }, [visualAnalysisSuspendedRef]);

  /** Clear the 20 Hz analyser when visuals are frozen; restart when they resume. */
  useEffect(() => {
    const sync = () => {
      const suspended = visualAnalysisSuspendedRef?.current ?? false;
      if (suspended) {
        stopAmplitudePoll();
      } else {
        startAmplitudePoll();
      }
    };
    sync();
    const id = window.setInterval(sync, 250);
    return () => window.clearInterval(id);
  }, [visualAnalysisSuspendedRef, startAmplitudePoll, stopAmplitudePoll]);

  const resetForSessionStart = useCallback(() => {
    micMutedRef.current = false;
    pttWarmCaptureRef.current = false;
    resetBargeIn();
    clearMicPreRoll();
  }, [resetBargeIn, clearMicPreRoll]);

  const resetOnWsClose = useCallback(() => {
    isSpeakingRef.current = false;
    clearMicPreRoll();
  }, [clearMicPreRoll]);

  const flushPlayback = useCallback(() => {
    audioPlayerRef.current?.flush();
  }, []);

  const teardown = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (amplitudeTimerRef.current) {
      clearInterval(amplitudeTimerRef.current);
      amplitudeTimerRef.current = null;
    }

    analyserRef.current = null;

    audioPlayerRef.current?.close();
    audioPlayerRef.current = null;
  }, []);

  const attachPcmForwarder = useCallback(
    (ws: WebSocket) => {
      const node = workletNodeRef.current;
      if (!node) return;

      node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer }>) => {
        const pcm = event.data.pcm;
        const transportReady =
          tokensRelayedRef.current && ws.readyState === WebSocket.OPEN;
        const wantsCapture = !micMutedRef.current || pttWarmCaptureRef.current;

        if (!transportReady) {
          if (wantsCapture) {
            micPreRollRef.current.push(pcm);
          }
          return;
        }

        const playbackAudible =
          audioPlayerRef.current?.isOutputActive(ECHO_TAIL_HANGOVER_SEC) ?? false;
        const aiTalking = isSpeakingRef.current || playbackAudible;

        if (aiTalking && !micMutedRef.current && !bargeInActiveRef.current) {
          const rms = rmsOfInt16Pcm(pcm);

          if (bargeInPendingRef.current) {
            if (!playbackAudible && rms >= BARGE_IN_RMS) {
              bargeInFrameCountRef.current += 1;
              if (bargeInFrameCountRef.current >= BARGE_IN_SUSTAIN_FRAMES) {
                bargeInActiveRef.current = true;
                bargeInPendingRef.current = false;
                bargeInFrameCountRef.current = 0;
              }
            } else if (rms < BARGE_IN_RMS) {
              bargeInFrameCountRef.current = 0;
            }
          } else {
            const duringPlayback = MAC_STRICT_ECHO_BARGE_IN ? aiTalking : playbackAudible;
            const threshold = duringPlayback ? BARGE_IN_RMS_DURING_PLAYBACK : BARGE_IN_RMS;
            const sustainNeeded = duringPlayback
              ? BARGE_IN_SUSTAIN_DURING_PLAYBACK
              : BARGE_IN_SUSTAIN_FRAMES;
            if (rms >= threshold) {
              bargeInFrameCountRef.current += 1;
              if (bargeInFrameCountRef.current >= sustainNeeded) {
                isSpeakingRef.current = false;
                audioPlayerRef.current?.flush();
                if (duringPlayback) {
                  bargeInPendingRef.current = true;
                } else {
                  bargeInActiveRef.current = true;
                }
                bargeInFrameCountRef.current = 0;
              }
            } else {
              bargeInFrameCountRef.current = 0;
            }
          }
        } else if (!aiTalking && bargeInPendingRef.current) {
          bargeInPendingRef.current = false;
          bargeInFrameCountRef.current = 0;
        }

        const shouldSendLiveMic =
          !micMutedRef.current &&
          (bargeInActiveRef.current ||
            (!isSpeakingRef.current && !playbackAudible && !bargeInPendingRef.current));

        if (micMutedRef.current) {
          wasGatingMicRef.current = false;
          ws.send(new ArrayBuffer(pcm.byteLength));
          return;
        }

        if (shouldSendLiveMic) {
          for (const buffered of micPreRollRef.current.drain()) {
            ws.send(buffered);
          }
          wasGatingMicRef.current = false;
          ws.send(pcm);
          return;
        }

        micPreRollRef.current.push(pcm);
        wasGatingMicRef.current = true;
        ws.send(new ArrayBuffer(pcm.byteLength));
      };
    },
    [tokensRelayedRef],
  );

  const startCapture = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
      },
      video: false,
    });
    streamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: 16_000 });
    audioCtxRef.current = audioCtx;

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    if (audioCtx.state !== "running") {
      throw new Error(
        `AudioContext could not start (state: ${audioCtx.state}). ` +
          "Make sure the action is triggered by a user gesture.",
      );
    }

    try {
      await audioCtx.audioWorklet.addModule(VOICE_CAPTURE_WORKLET_URL);
    } catch (e) {
      logAppDiagnostic("voice_worklet_load_failed", {
        url: VOICE_CAPTURE_WORKLET_URL,
        baseUrl: import.meta.env.BASE_URL,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    if (audioCtx.state !== "running") {
      throw new Error("AudioContext closed unexpectedly while loading voice processor.");
    }

    const workletNode = new AudioWorkletNode(audioCtx, "voice-capture-processor");
    workletNodeRef.current = workletNode;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyserRef.current = analyser;
    const srcNode = audioCtx.createMediaStreamSource(stream);
    srcNode.connect(analyser);
    srcNode.connect(workletNode);
    const silentSink = audioCtx.createGain();
    silentSink.gain.value = 0;
    workletNode.connect(silentSink);
    silentSink.connect(audioCtx.destination);

    if (!(visualAnalysisSuspendedRef?.current ?? false)) {
      startAmplitudePoll();
    }

    audioPlayerRef.current = new StreamingAudioPlayer(audioCtx);
  }, [visualAnalysisSuspendedRef, startAmplitudePoll]);

  const beginPttCaptureWarmup = useCallback(() => {
    pttWarmCaptureRef.current = true;
    clearMicPreRoll();
  }, [clearMicPreRoll]);

  const setMicCaptureEnabled = useCallback((enabled: boolean) => {
    micMutedRef.current = !enabled;
    setIsPttCapturing(enabled);
    if (enabled) {
      pttWarmCaptureRef.current = false;
      bargeInActiveRef.current = false;
      bargeInPendingRef.current = false;
      bargeInFrameCountRef.current = 0;
    }
  }, []);

  useEffect(() => {
    const resumeAll = () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (audioCtxRef.current?.state === "suspended") void audioCtxRef.current.resume();
        audioPlayerRef.current?.resumePlaybackIfSuspended();
      } catch {
        /* ignore — best-effort */
      }
    };
    document.addEventListener("visibilitychange", resumeAll);
    window.addEventListener("focus", resumeAll);
    return () => {
      document.removeEventListener("visibilitychange", resumeAll);
      window.removeEventListener("focus", resumeAll);
    };
  }, []);

  return {
    streamRef,
    micMutedRef,
    frameRouterRefs,
    visualMetricsRef,
    isPttCapturing,
    startCapture,
    teardown,
    attachPcmForwarder,
    setMicCaptureEnabled,
    beginPttCaptureWarmup,
    resetForSessionStart,
    resetOnWsClose,
    resetBargeIn,
    flushPlayback,
    clearMicPreRoll,
    resetAmplitudeVisuals,
    setPttCapturing: setIsPttCapturing,
  };
}
