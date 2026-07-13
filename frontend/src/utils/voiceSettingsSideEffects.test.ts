import { describe, expect, it, vi } from "vitest";
import { patchVoiceSettings, stopVoiceIfModeChanged } from "./voiceSettingsSideEffects";

describe("voiceSettingsSideEffects", () => {
  it("stops voice when interaction mode changes while listening", () => {
    const voice = {
      isListening: true,
      isReconnecting: false,
      stop: vi.fn(),
      dismissError: vi.fn(),
    };

    stopVoiceIfModeChanged("conversation", "pushToTalk", voice);

    expect(voice.stop).toHaveBeenCalledOnce();
    expect(voice.dismissError).toHaveBeenCalledOnce();
  });

  it("does not stop voice when mode is unchanged", () => {
    const voice = {
      isListening: true,
      isReconnecting: false,
      stop: vi.fn(),
      dismissError: vi.fn(),
    };

    stopVoiceIfModeChanged("conversation", "conversation", voice);

    expect(voice.stop).not.toHaveBeenCalled();
  });

  it("patchVoiceSettings forwards patch after stopping on mode change", () => {
    const onSettingsPatch = vi.fn();
    const voice = {
      isListening: true,
      isReconnecting: false,
      stop: vi.fn(),
      dismissError: vi.fn(),
    };

    patchVoiceSettings(
      { voiceInteractionMode: "conversation" } as import("../types/settings").AppSettings,
      { voiceInteractionMode: "pushToTalk" },
      onSettingsPatch,
      voice,
    );

    expect(voice.stop).toHaveBeenCalledOnce();
    expect(onSettingsPatch).toHaveBeenCalledWith({ voiceInteractionMode: "pushToTalk" });
  });

  it("clears stale errors when mode changes even if voice is idle", () => {
    const voice = {
      isListening: false,
      isReconnecting: false,
      stop: vi.fn(),
      dismissError: vi.fn(),
    };

    stopVoiceIfModeChanged("conversation", "pushToTalk", voice);

    expect(voice.stop).not.toHaveBeenCalled();
    expect(voice.dismissError).toHaveBeenCalledOnce();
  });
});
