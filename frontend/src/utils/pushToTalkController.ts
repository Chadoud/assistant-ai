/**
 * Push-to-talk state machine — hold key to capture, release to send one voice turn.
 * Mirrors Omi {@link PushToTalkManager} interaction semantics (without duplicating its STT stack).
 */

import type { PushToTalkState } from "../types/voiceInteraction";

const PTT_DOUBLE_TAP_THRESHOLD_MS = 400;
const PTT_TAP_TO_LOCK_MAX_HOLD_MS = 220;

type PushToTalkControllerCallbacks = {
  onStartCapture: () => void | Promise<void>;
  onEndCapture: () => void | Promise<void>;
  onEnterLockedMode: () => void | Promise<void>;
  onExitLockedMode: () => void | Promise<void>;
  onPlayStartSound?: () => void;
  onPlayEndSound?: () => void;
};

type PushToTalkControllerOptions = {
  doubleTapForLockedMode: boolean;
  soundsEnabled: boolean;
  callbacks: PushToTalkControllerCallbacks;
};

type PushToTalkController = {
  readonly state: PushToTalkState;
  handleKeyDown: () => void;
  handleKeyUp: () => void;
  cancel: () => void;
};

/**
 * Create a push-to-talk controller instance.
 */
export function createPushToTalkController(options: PushToTalkControllerOptions): PushToTalkController {
  let state: PushToTalkState = "idle";
  let lastKeyDownAt = 0;
  let lastKeyUpAt = 0;
  let pendingLockTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPendingLock = () => {
    if (pendingLockTimer) {
      clearTimeout(pendingLockTimer);
      pendingLockTimer = null;
    }
  };

  const playStart = () => {
    if (options.soundsEnabled) options.callbacks.onPlayStartSound?.();
  };

  const playEnd = () => {
    if (options.soundsEnabled) options.callbacks.onPlayEndSound?.();
  };

  const finalizeCapture = () => {
    if (state !== "listening" && state !== "pendingLockDecision" && state !== "lockedListening") return;
    clearPendingLock();
    state = "finalizing";
    playEnd();
    void options.callbacks.onEndCapture();
    state = "idle";
  };

  return {
    get state() {
      return state;
    },
    handleKeyDown() {
      const now = Date.now();
      if (state === "idle") {
        if (
          options.doubleTapForLockedMode &&
          lastKeyUpAt > 0 &&
          now - lastKeyUpAt < PTT_DOUBLE_TAP_THRESHOLD_MS
        ) {
          lastKeyUpAt = 0;
          state = "lockedListening";
          playStart();
          void options.callbacks.onEnterLockedMode();
          return;
        }
        lastKeyDownAt = now;
        state = "listening";
        playStart();
        void options.callbacks.onStartCapture();
        return;
      }
      if (state === "pendingLockDecision") {
        clearPendingLock();
        state = "lockedListening";
        playStart();
        void options.callbacks.onEnterLockedMode();
        return;
      }
      if (state === "lockedListening") {
        finalizeCapture();
      }
    },
    handleKeyUp() {
      const now = Date.now();
      if (state === "listening") {
        const holdMs = now - lastKeyDownAt;
        if (options.doubleTapForLockedMode && holdMs < PTT_TAP_TO_LOCK_MAX_HOLD_MS) {
          lastKeyUpAt = now;
          state = "pendingLockDecision";
          clearPendingLock();
          pendingLockTimer = setTimeout(() => {
            pendingLockTimer = null;
            if (state === "pendingLockDecision") finalizeCapture();
          }, PTT_DOUBLE_TAP_THRESHOLD_MS);
          return;
        }
        lastKeyUpAt = 0;
        finalizeCapture();
        return;
      }
      if (state === "pendingLockDecision" || state === "lockedListening") {
        /* locked mode ignores key-up until next key-down finalizes */
      }
    },
    cancel() {
      clearPendingLock();
      if (state === "lockedListening") {
        void options.callbacks.onExitLockedMode();
      }
      state = "idle";
      lastKeyUpAt = 0;
    },
  };
}
