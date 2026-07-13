/**
 * useMeetingTranscription — stream microphone audio to the backend in
 * transcription-only mode so a meeting's spoken content becomes live notes.
 *
 * Deliberately minimal vs ``useVoiceSession``: no playback, no barge-in, no tool
 * handling. It reuses the same AudioWorklet (16 kHz Int16 PCM) and binary WS
 * protocol, pointed at ``/ws/voice?mode=transcribe&meeting_id=…``. The backend
 * appends each completed utterance to the meeting's notes, which the panel polls.
 */

import { useCallback, useRef, useState } from "react";
import { BACKEND_HOST, BACKEND_PORT, VOICE_CAPTURE_WORKLET_URL } from "../constants";
import { sendVoiceWsAppAuth } from "../voice/voiceWsAuth";

const WS_URL = `ws://${BACKEND_HOST}:${BACKEND_PORT}/ws/voice`;

interface UseMeetingTranscriptionReturn {
  recording: boolean;
  error: string | null;
  /** True once the browser denies mic access (vs a transient failure). */
  micDenied: boolean;
  start: (meetingId: string) => Promise<void>;
  stop: () => void;
}

export function useMeetingTranscription(): UseMeetingTranscriptionReturn {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(new ArrayBuffer(0));
        ws.close();
      } catch {
        /* already closing */
      }
      wsRef.current = null;
    }
    workletRef.current?.port.close();
    workletRef.current?.disconnect();
    workletRef.current = null;
    srcRef.current?.disconnect();
    srcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(
    async (meetingId: string) => {
      setError(null);
      setMicDenied(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        streamRef.current = stream;

        const audioCtx = new AudioContext({ sampleRate: 16_000 });
        audioCtxRef.current = audioCtx;
        if (audioCtx.state === "suspended") await audioCtx.resume();
        await audioCtx.audioWorklet.addModule(VOICE_CAPTURE_WORKLET_URL);

        const ws = new WebSocket(
          `${WS_URL}?mode=transcribe&meeting_id=${encodeURIComponent(meetingId)}`,
        );
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          void sendVoiceWsAppAuth(ws);
        };

        ws.onerror = () => {
          setError("Transcription connection failed");
        };
        ws.onclose = () => {
          if (wsRef.current === ws) setRecording(false);
        };
        ws.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          try {
            const frame = JSON.parse(event.data) as { type?: string; message?: string };
            if (frame.type === "error" && frame.message) setError(frame.message);
          } catch {
            /* non-JSON frame — ignore */
          }
        };

        const workletNode = new AudioWorkletNode(audioCtx, "voice-capture-processor");
        workletRef.current = workletNode;
        const srcNode = audioCtx.createMediaStreamSource(stream);
        srcRef.current = srcNode;
        srcNode.connect(workletNode);

        workletNode.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer }>) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(e.data.pcm);
        };

        setRecording(true);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Couldn't start transcription";
        if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
          setMicDenied(true);
          setError("Microphone access denied");
        } else {
          setError(message);
        }
        stop();
      }
    },
    [stop],
  );

  return { recording, error, micDenied, start, stop };
}
