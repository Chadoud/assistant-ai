import { describe, expect, it, vi } from "vitest";
import {
  createPushToTalkController,
} from "./pushToTalkController";

describe("pushToTalkController", () => {
  it("hold then release starts and ends capture", () => {
    const onStartCapture = vi.fn();
    const onEndCapture = vi.fn();
    const ctrl = createPushToTalkController({
      doubleTapForLockedMode: false,
      soundsEnabled: false,
      callbacks: {
        onStartCapture,
        onEndCapture,
        onEnterLockedMode: vi.fn(),
        onExitLockedMode: vi.fn(),
      },
    });
    ctrl.handleKeyDown();
    expect(onStartCapture).toHaveBeenCalledTimes(1);
    ctrl.handleKeyUp();
    expect(onEndCapture).toHaveBeenCalledTimes(1);
    expect(ctrl.state).toBe("idle");
  });

  it("quick double tap enters locked mode", () => {
    vi.useFakeTimers();
    const onEnterLockedMode = vi.fn();
    const onEndCapture = vi.fn();
    const ctrl = createPushToTalkController({
      doubleTapForLockedMode: true,
      soundsEnabled: false,
      callbacks: {
        onStartCapture: vi.fn(),
        onEndCapture,
        onEnterLockedMode,
        onExitLockedMode: vi.fn(),
      },
    });
    ctrl.handleKeyDown();
    ctrl.handleKeyUp();
    vi.advanceTimersByTime(100);
    ctrl.handleKeyDown();
    expect(onEnterLockedMode).toHaveBeenCalledTimes(1);
    ctrl.handleKeyDown();
    expect(onEndCapture).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
