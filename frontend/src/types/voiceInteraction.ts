/** How the user talks to the AI voice layer. */
export type VoiceInteractionMode = "conversation" | "pushToTalk";

/**
 * Serializable push-to-talk shortcut stored in app settings.
 * `accelerator` is an Electron globalShortcut accelerator when global capture is enabled.
 */
export type PushToTalkShortcut = {
  /** Human-readable label, e.g. "⌥ Option" or "Right Alt". */
  displayLabel: string;
  /** Electron accelerator for global shortcut registration (may include modifiers + key). */
  accelerator: string;
  /** When true, PTT is also captured in-app via keyboard events (modifier-only keys). */
  captureInApp: boolean;
  /** Key code checked for in-app capture (e.g. AltLeft, AltRight). */
  inAppKey?: string;
};

export type PushToTalkState = "idle" | "listening" | "pendingLockDecision" | "lockedListening" | "finalizing";

const DEFAULT_PTT_SHORTCUT_DARWIN: PushToTalkShortcut = {
  displayLabel: "⌥ Option",
  // Electron globalShortcut requires a non-modifier key; in-app capture still uses Option alone.
  accelerator: "Alt+Space",
  captureInApp: true,
  inAppKey: "Alt",
};

const DEFAULT_PTT_SHORTCUT_WIN32: PushToTalkShortcut = {
  displayLabel: "Right Alt",
  accelerator: "Alt+Shift+Space",
  captureInApp: true,
  inAppKey: "AltRight",
};

const DEFAULT_PTT_SHORTCUT_LINUX: PushToTalkShortcut = {
  displayLabel: "Right Alt",
  accelerator: "Alt+Shift+Space",
  captureInApp: true,
  inAppKey: "AltRight",
};

/** Platform default PTT shortcut for first-run settings. */
export function defaultPushToTalkShortcut(): PushToTalkShortcut {
  if (typeof navigator !== "undefined") {
    const p = (navigator.platform || "").toLowerCase();
    if (p.includes("mac")) return { ...DEFAULT_PTT_SHORTCUT_DARWIN };
    if (p.includes("win")) return { ...DEFAULT_PTT_SHORTCUT_WIN32 };
  }
  return { ...DEFAULT_PTT_SHORTCUT_LINUX };
}
