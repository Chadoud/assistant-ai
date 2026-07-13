import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings } from "../types/settings";
import type { PushToTalkState } from "../types/voiceInteraction";
import type { UseVoiceSessionReturn } from "./useVoiceSession";
import { createPushToTalkController } from "../utils/pushToTalkController";
import { assertVoiceBackendReady } from "../voice/ensureVoiceBackendReady";

type UsePushToTalkOptions = {
  settings: AppSettings;
  voice: UseVoiceSessionReturn;
  backendOnline: boolean;
};

type UsePushToTalkReturn = {
  pttState: PushToTalkState;
  isLockedListening: boolean;
  shortcutLabel: string;
  showOverlay: boolean;
};

function playPttTone(frequency: number, durationMs: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => void ctx.close();
  } catch {
    /* optional feedback */
  }
}

function matchesInAppShortcut(event: KeyboardEvent, inAppKey?: string): boolean {
  if (!inAppKey) return false;
  if (inAppKey === "Alt") {
    return event.key === "Alt" || event.code === "AltLeft" || event.code === "AltRight";
  }
  return event.code === inAppKey || event.key === inAppKey;
}

/**
 * Wire push-to-talk keyboard / global shortcut capture to the shared voice session.
 */
export function usePushToTalk({ settings, voice, backendOnline }: UsePushToTalkOptions): UsePushToTalkReturn {
  const [pttState, setPttState] = useState<PushToTalkState>("idle");
  const controllerRef = useRef<ReturnType<typeof createPushToTalkController> | null>(null);
  const sessionOpeningRef = useRef(false);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const ensureWarmSession = useCallback(async () => {
    if (sessionOpeningRef.current) return;
    const v = voiceRef.current;
    if (v.isListening || v.isReconnecting) return;
    if (!backendOnline) return;
    sessionOpeningRef.current = true;
    try {
      await assertVoiceBackendReady(settings, { backendOnline });
      await v.startForPushToTalk();
    } finally {
      sessionOpeningRef.current = false;
    }
  }, [backendOnline, settings]);

  useEffect(() => {
    controllerRef.current = createPushToTalkController({
      doubleTapForLockedMode: settings.pttDoubleTapForLockedMode,
      soundsEnabled: settings.pttSoundsEnabled,
      callbacks: {
        onStartCapture: async () => {
          voiceRef.current.beginPttCaptureWarmup();
          await ensureWarmSession();
          voiceRef.current.setMicCaptureEnabled(true);
          setPttState(controllerRef.current?.state ?? "listening");
        },
        onEndCapture: async () => {
          voiceRef.current.sendPttTurnEnd();
          setPttState(controllerRef.current?.state ?? "idle");
        },
        onEnterLockedMode: async () => {
          voiceRef.current.beginPttCaptureWarmup();
          await ensureWarmSession();
          voiceRef.current.setMicCaptureEnabled(true);
          setPttState("lockedListening");
        },
        onExitLockedMode: () => {
          voiceRef.current.setMicCaptureEnabled(false);
          setPttState("idle");
        },
        onPlayStartSound: () => playPttTone(880, 55),
        onPlayEndSound: () => playPttTone(440, 45),
      },
    });
    return () => {
      controllerRef.current?.cancel();
      controllerRef.current = null;
    };
  }, [ensureWarmSession, settings.pttDoubleTapForLockedMode, settings.pttSoundsEnabled]);

  const handleKeyDown = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    ctrl.handleKeyDown();
    setPttState(ctrl.state);
  }, []);

  const handleKeyUp = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    ctrl.handleKeyUp();
    setPttState(ctrl.state);
  }, []);

  useEffect(() => {
    if (settings.voiceInteractionMode !== "pushToTalk") return;
    if (!settings.pttShortcut.captureInApp) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesInAppShortcut(event, settings.pttShortcut.inAppKey)) return;
      if (event.repeat) return;
      event.preventDefault();
      handleKeyDown();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!matchesInAppShortcut(event, settings.pttShortcut.inAppKey)) return;
      event.preventDefault();
      handleKeyUp();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleKeyDown, handleKeyUp, settings.pttShortcut, settings.voiceInteractionMode]);

  useEffect(() => {
    if (settings.voiceInteractionMode !== "pushToTalk") return;
    const api = window.electronAPI;
    if (!api?.onPushToTalkKeyDown) return;
    const offDown = api.onPushToTalkKeyDown(() => handleKeyDown());
    const offUp = api.onPushToTalkKeyUp?.(() => handleKeyUp());
    return () => {
      offDown?.();
      offUp?.();
    };
  }, [handleKeyDown, handleKeyUp, settings.voiceInteractionMode]);

  useEffect(() => {
    if (settings.voiceInteractionMode !== "pushToTalk") {
      controllerRef.current?.cancel();
      setPttState("idle");
      void window.electronAPI?.setPushToTalkConfig?.({ enabled: false });
      return;
    }
    void window.electronAPI?.setPushToTalkConfig?.({
      enabled: settings.pttGlobalWhenAppInBackground,
      accelerator: settings.pttShortcut.accelerator,
    });
  }, [
    settings.pttGlobalWhenAppInBackground,
    settings.pttShortcut.accelerator,
    settings.voiceInteractionMode,
  ]);

  const showOverlay =
    settings.voiceInteractionMode === "pushToTalk" &&
    settings.pttShowOverlay &&
    (voice.isPttCapturing || pttState === "lockedListening");

  return {
    pttState,
    isLockedListening: pttState === "lockedListening",
    shortcutLabel: settings.pttShortcut.displayLabel,
    showOverlay,
  };
}
