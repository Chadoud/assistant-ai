import { describe, expect, it } from "vitest";
import { buildAssistantToolAppendix } from "./toolAppendix";

describe("buildAssistantToolAppendix", () => {
  it("includes the exosites-action fence shape", () => {
    const appendix = buildAssistantToolAppendix();
    expect(appendix).toContain("exosites-action");
  });

  it("excludes mail and calendar fetch commands that the frontend handles deterministically", () => {
    const appendix = buildAssistantToolAppendix();
    // These are fetched by the frontend's intent-routing path, not by LLM tool calls.
    // If they appear in the appendix the LLM emits raw JSON blocks instead of letting
    // the grounded fetch path run.
    expect(appendix).not.toContain("graph_mail_search");
    expect(appendix).not.toContain("gmail_search_messages");
    expect(appendix).not.toContain("graph_calendar_list_events");
    expect(appendix).not.toContain("google_calendar_list_events");
    expect(appendix).not.toContain("infomaniak_calendar_list_events");
  });

  it("still includes non-data-fetch commands like file uploads and navigation", () => {
    const appendix = buildAssistantToolAppendix();
    expect(appendix).toContain("google_drive_upload_text");
  });
});
