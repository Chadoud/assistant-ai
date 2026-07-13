import { describe, it, expect } from "vitest";
import { validateParsedCommand } from "./catalog";

describe("validateParsedCommand", () => {
  it("accepts restart_backend with empty args", () => {
    expect(validateParsedCommand({ v: 1, commandId: "restart_backend", args: {} })).toMatchObject({
      ok: true,
    });
  });

  it("accepts open_workspace_folder with non-negative integer index", () => {
    expect(validateParsedCommand({ v: 1, commandId: "open_workspace_folder", args: { index: 0 } })).toMatchObject({
      ok: true,
    });
    expect(validateParsedCommand({ v: 1, commandId: "open_workspace_folder", args: { index: -1 } })).toMatchObject({
      ok: false,
    });
  });

  it("accepts save_text_file for output and workspace", () => {
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "save_text_file",
        args: { destination: "output", fileName: "note.txt", content: "hello" },
      })
    ).toMatchObject({ ok: true });
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "save_text_file",
        args: {
          destination: "workspace",
          workspaceIndex: 0,
          fileName: "story.md",
          content: "# hi",
        },
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects save_text_file with bad file name or path-ish name", () => {
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "save_text_file",
        args: { destination: "output", fileName: "evil/../x.txt", content: "x" },
      })
    ).toMatchObject({ ok: false, error: "save_text_bad_file_name" });
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "save_text_file",
        args: { destination: "output", fileName: "noext", content: "x" },
      })
    ).toMatchObject({ ok: false, error: "save_text_bad_file_name" });
  });

  it.each(["chrome", "vscode", "firefox", "winword", "steam"] as const)(
    "accepts open_application for %s",
    (app) => {
      const r = validateParsedCommand({ v: 1, commandId: "open_application", args: { app } });
      expect(r).toMatchObject({ ok: true });
      if (r.ok) expect(r.command.args).toEqual({ app });
    }
  );

  it("accepts graph_onedrive_upload_text and google_drive_upload_text with valid names", () => {
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "graph_onedrive_upload_text",
        args: { fileName: "note.txt", content: "hello" },
      })
    ).toMatchObject({ ok: true });
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "google_drive_upload_text",
        args: { fileName: "story.md", content: "# hi" },
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects cloud upload with bad file name or extra keys", () => {
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "google_drive_upload_text",
        args: { fileName: "evil/../x.txt", content: "x" },
      })
    ).toMatchObject({ ok: false, error: "cloud_upload_bad_file_name" });
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "graph_onedrive_upload_text",
        args: { fileName: "a.txt", content: "x", extra: 1 },
      })
    ).toMatchObject({ ok: false, error: "cloud_upload_extra_keys" });
  });

  it("accepts graph_calendar_list_events with ISO window and caps maxEvents", () => {
    const r = validateParsedCommand({
      v: 1,
      commandId: "graph_calendar_list_events",
      args: {
        startDateTime: "2026-05-01T00:00:00Z",
        endDateTime: "2026-05-02T00:00:00Z",
        maxEvents: 100,
      },
    });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.command.args.maxEvents).toBeLessThanOrEqual(50);
  });

  it("rejects calendar commands with inverted range", () => {
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "google_calendar_list_events",
        args: {
          startDateTime: "2026-05-02T00:00:00Z",
          endDateTime: "2026-05-01T00:00:00Z",
        },
      })
    ).toMatchObject({ ok: false, error: "calendar_bad_range" });
  });

  it("accepts graph_mail_search with optional query", () => {
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "graph_mail_search",
        args: { query: "subject:test", maxMessages: 10 },
      })
    ).toMatchObject({ ok: true });
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "graph_mail_search",
        args: {},
      })
    ).toMatchObject({ ok: true });
  });

  it("accepts gmail_search_messages with query string", () => {
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "gmail_search_messages",
        args: { query: "is:unread", maxMessages: 5 },
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects gmail_search_messages when query is not a string", () => {
    expect(
      validateParsedCommand({
        v: 1,
        commandId: "gmail_search_messages",
        args: { query: 1, maxMessages: 5 },
      })
    ).toMatchObject({ ok: false, error: "gmail_search_bad_query" });
  });

});
