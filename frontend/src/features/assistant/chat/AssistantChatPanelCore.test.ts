import { describe, expect, it } from "vitest";
import {
  AssistantChatPanelBody,
  AssistantChatPanelWithSharedVoice,
} from "./AssistantChatPanelCore";

/**
 * The panel's decision logic is covered by behavior tests on the units it
 * delegates to — intent routing in `systemCommands/assistantIntent.test.ts`
 * and the voice PCM/spectrum layer in `hooks/voiceAudio.test.ts`. This module
 * only asserts the composition entrypoints stay wired so the AI workspace and
 * Exo HUD both keep importing a real component.
 */
describe("AssistantChatPanelCore", () => {
  it("exports chat panel entrypoints for AI workspace and Exo", () => {
    expect(typeof AssistantChatPanelWithSharedVoice).toBe("function");
    expect(typeof AssistantChatPanelBody).toBe("function");
  });
});
