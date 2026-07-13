import { describe, expect, it, vi, beforeEach } from "vitest";
import { workspaceBatchDesktopUnavailableMessageKey } from "./workspaceBatchDesktopGate";

describe("workspaceBatchDesktopGate", () => {
  beforeEach(() => {
    vi.stubGlobal("electronAPI", undefined);
  });

  it("returns Drive unavailable when desktop IPC is missing", () => {
    expect(
      workspaceBatchDesktopUnavailableMessageKey({
        driveOn: true,
        dropboxOn: false,
        oneDriveOn: false,
        outlookOn: false,
        infomaniakMailOn: false,
      }),
    ).toBe("queue.workspaceBatchDriveUnavailable");
  });

  it("returns null when no gated sources are selected", () => {
    expect(
      workspaceBatchDesktopUnavailableMessageKey({
        driveOn: false,
        dropboxOn: false,
        oneDriveOn: false,
        outlookOn: false,
        infomaniakMailOn: false,
      }),
    ).toBeNull();
  });
});
