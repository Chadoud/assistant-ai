import { describe, expect, it } from "vitest";
import {
  isPttMicOpen,
  isPttVoiceUiActive,
  isPushToTalkMode,
} from "./voiceInteractionUi";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";

describe("voiceInteractionUi", () => {
  it("detects push-to-talk mode from settings", () => {
    expect(isPushToTalkMode({ voiceInteractionMode: "pushToTalk" })).toBe(true);
    expect(isPushToTalkMode({ voiceInteractionMode: "conversation" })).toBe(false);
    expect(isPushToTalkMode(DEFAULT_APP_SETTINGS)).toBe(false);
  });

  it("treats a warm PTT socket without open mic as inactive UI", () => {
    expect(
      isPttVoiceUiActive({
        isPttCapturing: false,
        isReconnecting: false,
        inputTranscript: "",
        outputTranscript: "",
        toolPhaseLabel: null,
        pendingToolApproval: null,
      }),
    ).toBe(false);
  });

  it("activates PTT UI while the mic is held or a turn is in flight", () => {
    expect(isPttMicOpen({ isPttCapturing: true })).toBe(true);
    expect(
      isPttVoiceUiActive({
        isPttCapturing: true,
        isReconnecting: false,
      }),
    ).toBe(true);
    expect(
      isPttVoiceUiActive({
        isPttCapturing: false,
        isReconnecting: false,
        outputTranscript: "Checking your calendar…",
      }),
    ).toBe(true);
  });
});
