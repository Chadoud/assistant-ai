import { describe, expect, it } from "vitest";
import { createWorkspaceAssistantBridge } from "./workspaceAssistant";

describe("createWorkspaceAssistantBridge", () => {
  it("registers and triggers run batch", async () => {
    const bridge = createWorkspaceAssistantBridge();
    let called = false;
    bridge.registerRunBatch(async (opts) => {
      called = true;
      expect(opts?.forceGoogleDrive).toBe(true);
    });
    await bridge.triggerRunBatch({ forceGoogleDrive: true });
    expect(called).toBe(true);
  });

  it("clears registration on null", async () => {
    const bridge = createWorkspaceAssistantBridge();
    bridge.registerRunBatch(async () => {});
    bridge.registerRunBatch(null);
    await expect(bridge.triggerRunBatch()).resolves.toBeUndefined();
  });
});
