import { describe, expect, it } from "vitest";
import {
  buildEventStartIso,
  classifyIntent,
  computeCalendarWindow,
  extractEventTitleFromText,
  isCodegenTask,
  isMailWriteIntent,
  mergeCalendarWriteContext,
} from "./assistantIntent";

describe("classifyIntent — UI hints and IPC prefetch fallback (server routes via POST /assistant/turn)", () => {
  it("routes calendar reads", () => {
    expect(classifyIntent("what's on my calendar today")).toBe("read_calendar");
  });

  it("routes mail reads, including financial-document phrasing", () => {
    expect(classifyIntent("show me my inbox")).toBe("read_mail");
    expect(classifyIntent("what are my latest invoices")).toBe("read_mail");
  });

  it("routes combined calendar + mail to read_both", () => {
    expect(classifyIntent("summarize my calendar and emails")).toBe("read_both");
  });

  it("prioritises calendar write over read", () => {
    expect(classifyIntent("schedule a meeting with Sam")).toBe("write_calendar");
    expect(
      classifyIntent("pour demain il faut que j'achète une bouteille de bourbon à midi"),
    ).toBe("write_calendar");
    expect(classifyIntent("delete all WORK events from my calendar")).toBe(
      "write_calendar_delete",
    );
  });

  it("routes app-build requests to codegen, not calendar write", () => {
    expect(classifyIntent("create a react todo app")).toBe("codegen_studio");
  });

  it("routes provider-targeted actions to external_source_task", () => {
    // Note: 'move a/the/my …' is intentionally caught earlier by calendar-write,
    // so an external-source action must use a non-calendar verb like upload.
    expect(classifyIntent("upload a report to Dropbox")).toBe("external_source_task");
  });

  it("falls back to generic chat", () => {
    expect(classifyIntent("how are you?")).toBe("generic_chat");
  });

  it("reuses the prior read intent for a short confirmation follow-up", () => {
    expect(classifyIntent("do it", "what's on my calendar tomorrow")).toBe("read_calendar");
  });

  it("does not hijack normal chat that merely starts like a confirmation", () => {
    expect(classifyIntent("yesterday was great", "tell me a joke")).toBe("generic_chat");
  });
});

describe("computeCalendarWindow", () => {
  const now = new Date("2026-06-09T12:00:00Z"); // Tuesday

  it("returns a one-day window for 'today'", () => {
    const { startIso, endIso } = computeCalendarWindow("anything today", now);
    const span = new Date(endIso).getTime() - new Date(startIso).getTime();
    expect(span).toBe(24 * 60 * 60 * 1000);
  });

  it("defaults to a 7-day window when no temporal clue is present", () => {
    const { startIso, endIso } = computeCalendarWindow("show my agenda", now);
    const span = new Date(endIso).getTime() - new Date(startIso).getTime();
    expect(span).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("write-intent extraction helpers", () => {
  it("detects mail write intent", () => {
    expect(isMailWriteIntent("send an email to Alex")).toBe(true);
    expect(isMailWriteIntent("what's in my inbox")).toBe(false);
  });

  it("extracts a quoted event title", () => {
    expect(extractEventTitleFromText('schedule "Quarterly Review" for Monday')).toBe(
      "Quarterly Review",
    );
  });

  it("extracts the subject after a colon in French create-event phrasing", () => {
    expect(
      extractEventTitleFromText("Crée un événement demain à midi : acheter bourbon à Turinsev"),
    ).toBe("Acheter bourbon à Turinsev");
  });

  it("extracts the subject after for/about without requiring a capital letter", () => {
    expect(extractEventTitleFromText("create an event for buy bourbon at Turinsev")).toBe(
      "Buy bourbon at Turinsev",
    );
    expect(extractEventTitleFromText("schedule a meeting about quarterly review")).toBe(
      "Quarterly review",
    );
  });

  it("extracts a title from with-phrasing", () => {
    expect(extractEventTitleFromText("book a meeting with Sam tomorrow")).toBe("Sam");
  });

  it("parses midi and noon as 12:00 for event start time", () => {
    const frStart = buildEventStartIso("créer un événement demain à midi");
    expect(new Date(frStart).getHours()).toBe(12);
    expect(new Date(frStart).getMinutes()).toBe(0);

    const enStart = buildEventStartIso("create an event tomorrow at noon");
    expect(new Date(enStart).getHours()).toBe(12);
    expect(new Date(enStart).getMinutes()).toBe(0);
  });

  it("isCodegenTask recognises multi-file build requests", () => {
    expect(isCodegenTask("build a website with vite and tailwind")).toBe(true);
    expect(isCodegenTask("Hey, can you build a cool up for our demo?")).toBe(true);
    expect(isCodegenTask("build a cool app")).toBe(true);
    expect(isCodegenTask("what time is it")).toBe(false);
  });

  it("routes time follow-up to write_calendar when prior turn was a create request", () => {
    const prior = "un événement pour demain pour que j'aille faire du paddle avec Alexandre.";
    expect(classifyIntent("midi", prior)).toBe("write_calendar");
    expect(classifyIntent("à midi", prior)).toBe("write_calendar");
  });

  it("mergeCalendarWriteContext combines prior create request with time answer", () => {
    const prior = "Crée un événement demain : paddle avec Alexandre";
    expect(mergeCalendarWriteContext(prior, "midi")).toContain("paddle");
    expect(mergeCalendarWriteContext(prior, "midi")).toContain("midi");
    const start = buildEventStartIso(mergeCalendarWriteContext(prior, "midi"));
    expect(new Date(start).getHours()).toBe(12);
  });
});
