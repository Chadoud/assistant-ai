import { describe, expect, it } from "vitest";
import type { AppSettings } from "../types/settings";
import { ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED } from "./assistantToolCatalogUi";
import { shouldRunAssistantSystemCommand } from "./assistantExecutionGate";

/** Runtime-only fields used by {@link shouldRunAssistantSystemCommand}; satisfies structural typing for tests. */
const base = {
  assistantToolsEnabled: true,
  assistantToolsReadEnabled: true,
  assistantToolsWriteEnabled: false,
  assistantToolsProviderMicrosoft: true,
  assistantToolsProviderGoogle: true,
  assistantToolsProviderInfomaniak: true,
  assistantToolsFollowUpEnabled: false,
} as unknown as AppSettings;

describe("shouldRunAssistantSystemCommand", () => {
  it("blocks when master assistant tools are off", () => {
    const r = shouldRunAssistantSystemCommand({ ...base, assistantToolsEnabled: false }, "graph_mail_search");
    expect(r).toEqual({ ok: false, reason: "assistant_disabled" });
  });

  it("blocks read integration commands when read tier is off", () => {
    const r = shouldRunAssistantSystemCommand(
      { ...base, assistantToolsReadEnabled: false },
      "google_calendar_list_events"
    );
    expect(r).toEqual({ ok: false, reason: "read_disabled" });
  });

  it("blocks Microsoft integration commands when Microsoft provider is off", () => {
    const r = shouldRunAssistantSystemCommand(
      { ...base, assistantToolsProviderMicrosoft: false },
      "graph_calendar_list_events"
    );
    expect(r).toEqual({ ok: false, reason: "provider_microsoft" });
  });

  it("blocks Microsoft integration commands when Microsoft is not linked", () => {
    const r = shouldRunAssistantSystemCommand(base, "graph_calendar_list_events", new Set(["google-gmail"]));
    expect(r).toEqual({ ok: false, reason: "provider_microsoft" });
  });

  it("allows Microsoft integration commands when Microsoft account is linked", () => {
    expect(
      shouldRunAssistantSystemCommand(base, "graph_calendar_list_events", new Set(["outlook"]))
    ).toEqual({ ok: true });
  });

  it("allows graph_calendar_list_events when gates pass", () => {
    expect(shouldRunAssistantSystemCommand(base, "graph_calendar_list_events")).toEqual({ ok: true });
  });

  it("blocks catalog tools that are not installed when list is explicit", () => {
    const partial = ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED.filter((id) => id !== "graph_mail_search");
    const r = shouldRunAssistantSystemCommand(
      { ...base, assistantInstalledToolIds: partial },
      "graph_mail_search"
    );
    expect(r).toEqual({ ok: false, reason: "tool_not_installed" });
  });
});
