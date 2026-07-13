import { describe, expect, it } from "vitest";
import { extractExositesAction } from "./parseExositesAction";
import { validateParsedCommand } from "./catalog";

describe("validateParsedCommand", () => {
  it("accepts navigate_tab", () => {
    const r = validateParsedCommand({
      v: 1,
      commandId: "navigate_tab",
      args: { tab: "settings" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.command.args).toEqual({ tab: "settings" });
  });

  it("accepts navigate_tab assistant", () => {
    const r = validateParsedCommand({
      v: 1,
      commandId: "navigate_tab",
      args: { tab: "assistant" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.command.args).toEqual({ tab: "assistant" });
  });

  it("accepts navigate_tab exo", () => {
    const r = validateParsedCommand({
      v: 1,
      commandId: "navigate_tab",
      args: { tab: "exo" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.command.args).toEqual({ tab: "exo" });
  });

  it("rejects bad tab", () => {
    const r = validateParsedCommand({
      v: 1,
      commandId: "navigate_tab",
      args: { tab: "bogus" },
    });
    expect(r.ok).toBe(false);
  });

  it("accepts open_output_folder with empty args", () => {
    const r = validateParsedCommand({ v: 1, commandId: "open_output_folder", args: {} });
    expect(r.ok).toBe(true);
  });

  it("accepts open_application with a known app key", () => {
    const r = validateParsedCommand({ v: 1, commandId: "open_application", args: { app: "chrome" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.command.args).toEqual({ app: "chrome" });
  });

  it("rejects open_application with unknown key", () => {
    const r = validateParsedCommand({
      v: 1,
      commandId: "open_application",
      args: { app: "unknown_app_xyz" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("extractExositesAction", () => {
  it("parses a valid fenced block", () => {
    const text = `Hello.\n\`\`\`exosites-action\n{"v":1,"commandId":"open_help","args":{}}\n\`\`\`\n`;
    const { command, parseError, displayText } = extractExositesAction(text);
    expect(parseError).toBeNull();
    expect(command?.commandId).toBe("open_help");
    expect(displayText).not.toContain("exosites-action");
  });

  it("parses when JSON starts on the same line as the fence tag (no newline after tag)", () => {
    const text = 'Sure.\n```exosites-action {"v":1,"commandId":"open_application","args":{"app":"chrome"}}\n```';
    const { command, parseError } = extractExositesAction(text);
    expect(parseError).toBeNull();
    expect(command?.commandId).toBe("open_application");
  });

  it("parses open_application when args name another known app (e.g. vscode)", () => {
    const text =
      'OK.\n```exosites-action\n{"v":1,"commandId":"open_application","args":{"app":"vscode"}}\n```\n';
    const { command, parseError } = extractExositesAction(text);
    expect(parseError).toBeNull();
    expect(command?.commandId).toBe("open_application");
    if (command?.commandId === "open_application") {
      expect((command.args as { app?: string }).app).toBe("vscode");
    }
  });

  it("returns no command when fence missing", () => {
    const { command } = extractExositesAction("Just text");
    expect(command).toBeNull();
  });

  it("returns parseError on bad JSON", () => {
    const { command, parseError } = extractExositesAction(
      "```exosites-action\nnot json\n```"
    );
    expect(command).toBeNull();
    expect(parseError).toBe("invalid_json");
  });

  it("uses the first valid command when the model outputs NDJSON (multiple lines)", () => {
    const text = `[TOOL_CALLS]\`\`\`exosites-action
{"v":1,"commandId":"open_application","args":{"app":"whatsapp"}}
{"v":1,"commandId":"send_whatsapp_message","args":{"phoneNumber":"x","message":"y"}}
\`\`\``;
    const { command, parseError, displayText } = extractExositesAction(text);
    expect(parseError).toBeNull();
    expect(command?.commandId).toBe("open_application");
    if (command?.commandId === "open_application") {
      expect((command.args as { app?: string }).app).toBe("whatsapp");
    }
    expect(displayText).not.toContain("TOOL_CALLS");
  });

  it("strips [TOOL_CALLS] from display when the fence is missing", () => {
    const { displayText } = extractExositesAction("[TOOL_CALLS] Hello only.");
    expect(displayText).toBe("Hello only.");
  });
});
