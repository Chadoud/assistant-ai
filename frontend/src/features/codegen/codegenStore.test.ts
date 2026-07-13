import { describe, it, expect } from "vitest";
import { reduceCodegenEvent, type CodegenState } from "./codegenStore";

function baseState(): CodegenState {
  return {
    sessionId: "sess-1",
    goal: "Build app",
    phase: "generating",
    previewUrl: null,
    projectPath: null,
    stackLabel: null,
    installCommand: null,
    devCommand: null,
    logTail: "",
    filesWritten: 0,
    lastWrittenPath: null,
    recentFiles: [],
    skipInstall: false,
    reuseDevServer: false,
    error: null,
    errorClass: null,
    errorPackages: [],
    relayNotice: null,
    repairAttempts: 0,
    planSteps: [],
    stack: null,
  };
}

describe("reduceCodegenEvent", () => {
  it("increments files_written from SSE total", () => {
    const next = reduceCodegenEvent(baseState(), { type: "file_written", total: 3 });
    expect(next.filesWritten).toBe(3);
    expect(next.phase).toBe("generating");
  });

  it("transitions to installing on awaiting_dev", () => {
    const next = reduceCodegenEvent(baseState(), {
      type: "awaiting_dev",
      project_path: "/tmp/studio/sess-1",
      stack_label: "vite",
      install_command: "npm install",
      dev_command: "npm run dev",
      files_written: 5,
    });
    expect(next.phase).toBe("installing");
    expect(next.stackLabel).toBe("vite");
    expect(next.installCommand).toBe("npm install");
    expect(next.filesWritten).toBe(5);
  });

  it("sets error phase on session_error", () => {
    const next = reduceCodegenEvent(baseState(), { type: "session_error", error: "npm failed" });
    expect(next.phase).toBe("error");
    expect(next.error).toBe("npm failed");
  });

  it("tracks recent file paths from file_written", () => {
    const next = reduceCodegenEvent(baseState(), { type: "file_written", path: "src/App.tsx", total: 1 });
    expect(next.lastWrittenPath).toBe("src/App.tsx");
    expect(next.recentFiles).toEqual(["src/App.tsx"]);
  });

  it("reads skip flags from awaiting_dev", () => {
    const next = reduceCodegenEvent(baseState(), {
      type: "awaiting_dev",
      skip_install: true,
      reuse_dev_server: true,
      project_path: "/tmp/p",
      install_command: "npm install",
      dev_command: "npm run dev",
    });
    expect(next.skipInstall).toBe(true);
    expect(next.reuseDevServer).toBe(true);
  });

  it("skips install for static stacks with empty install_command", () => {
    const next = reduceCodegenEvent(baseState(), {
      type: "awaiting_dev",
      skip_install: true,
      project_path: "/tmp/p",
      install_command: "",
      dev_command: "npx --yes serve -l tcp://127.0.0.1:5300",
      stack_label: "static",
    });
    expect(next.skipInstall).toBe(true);
    expect(next.devCommand).toContain("serve");
  });

  it("clears relay notice after file_written", () => {
    const withRelay = reduceCodegenEvent(baseState(), { type: "provider_relay", to: "anthropic" });
    expect(withRelay.relayNotice).toContain("Anthropic");
    const afterFile = reduceCodegenEvent(withRelay, { type: "file_written", total: 1 });
    expect(afterFile.relayNotice).toBeNull();
  });

  it("captures the AI plan and stack from a plan event", () => {
    const next = reduceCodegenEvent(baseState(), {
      type: "plan",
      stack: "Vite + React + TS",
      steps: [
        { title: "Build the feed", kind: "generate" },
        { title: "Install packages", kind: "install" },
        { title: "Live preview", kind: "preview" },
      ],
    });
    expect(next.phase).toBe("planning");
    expect(next.stack).toBe("Vite + React + TS");
    expect(next.planSteps).toHaveLength(3);
    expect(next.planSteps[0]).toEqual({ title: "Build the feed", kind: "generate" });
  });

  it("applies backend phase events", () => {
    const next = reduceCodegenEvent(baseState(), { type: "phase", phase: "scaffolding" });
    expect(next.phase).toBe("scaffolding");
  });

  it("does not rewind phase on a stray file_written while scaffolding", () => {
    const scaffolding = reduceCodegenEvent(baseState(), { type: "phase", phase: "scaffolding" });
    const afterFile = reduceCodegenEvent(scaffolding, { type: "file_written", path: "package.json", total: 1 });
    expect(afterFile.phase).toBe("scaffolding");
  });
});
