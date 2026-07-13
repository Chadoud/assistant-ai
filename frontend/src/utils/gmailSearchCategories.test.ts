import { describe, expect, it } from "vitest";
import {
  buildGmailQueryFromSelection,
  GMAIL_QUERY_DEFAULT_INBOX,
  GMAIL_QUERY_INBOX_PRIMARY_TAB,
  GMAIL_SELECTION_ALL_INBOX,
  GMAIL_SELECTION_ALL_MAIL,
  GMAIL_SELECTION_SPAM,
  parseGmailQueryToSelectionIds,
} from "./gmailSearchCategories";

describe("gmailSearchCategories", () => {
  it("maps All mail selection to in:anywhere", () => {
    const s = new Set([GMAIL_SELECTION_ALL_MAIL]);
    expect(buildGmailQueryFromSelection(s)).toBe("in:anywhere");
  });

  it("parses in:anywhere to All mail and round-trips", () => {
    const ids = parseGmailQueryToSelectionIds("in:anywhere");
    expect(ids.has(GMAIL_SELECTION_ALL_MAIL)).toBe(true);
    expect(buildGmailQueryFromSelection(ids)).toBe("in:anywhere");
  });

  it("parses parenthesized in:anywhere to All mail", () => {
    const ids = parseGmailQueryToSelectionIds("(in:anywhere)");
    expect(ids.has(GMAIL_SELECTION_ALL_MAIL)).toBe(true);
  });

  it("maps solo Primary category checkbox to full Inbox query", () => {
    const s = new Set(["category:primary"]);
    expect(buildGmailQueryFromSelection(s)).toBe(GMAIL_QUERY_DEFAULT_INBOX);
  });

  it("maps legacy inbox+primary operator to full Inbox on rebuild", () => {
    const legacy = "in:inbox category:primary";
    expect(buildGmailQueryFromSelection(parseGmailQueryToSelectionIds(legacy))).toBe(
      GMAIL_QUERY_DEFAULT_INBOX,
    );
  });

  it("normalizes legacy bare category:primary to full Inbox selection", () => {
    const ids = parseGmailQueryToSelectionIds("category:primary");
    expect(ids.has(GMAIL_SELECTION_ALL_INBOX)).toBe(true);
    expect(buildGmailQueryFromSelection(ids)).toBe(GMAIL_QUERY_DEFAULT_INBOX);
  });

  it("maps legacy Primary-tab shim query to full Inbox selection", () => {
    const ids = parseGmailQueryToSelectionIds(GMAIL_QUERY_INBOX_PRIMARY_TAB);
    expect(ids.has(GMAIL_SELECTION_ALL_INBOX)).toBe(true);
    expect(buildGmailQueryFromSelection(ids)).toBe(GMAIL_QUERY_DEFAULT_INBOX);
  });

  it("builds inbox-scoped OR for two tabs", () => {
    const s = new Set(["category:primary", "category:social"]);
    expect(buildGmailQueryFromSelection(s)).toBe("in:inbox (category:primary OR category:social)");
  });

  it("builds all inbox and spam", () => {
    const s = new Set([GMAIL_SELECTION_ALL_INBOX, GMAIL_SELECTION_SPAM]);
    expect(buildGmailQueryFromSelection(s)).toBe("(in:inbox OR in:spam)");
  });

  it("parses legacy OR-only query and rebuilds with inbox scope", () => {
    const q = "(category:primary OR category:promotions)";
    const ids = parseGmailQueryToSelectionIds(q);
    expect(ids.has("category:primary")).toBe(true);
    expect(ids.has("category:promotions")).toBe(true);
    expect(buildGmailQueryFromSelection(ids)).toBe("in:inbox (category:primary OR category:promotions)");
  });

  it("round-trips inbox and spam (new and legacy primary+spam shapes)", () => {
    const s = new Set<string>([GMAIL_SELECTION_ALL_INBOX, GMAIL_SELECTION_SPAM]);
    const q = buildGmailQueryFromSelection(s);
    expect(q).toBe("(in:inbox OR in:spam)");
    const ids = parseGmailQueryToSelectionIds(q);
    expect(ids.has(GMAIL_SELECTION_ALL_INBOX)).toBe(true);
    expect(ids.has(GMAIL_SELECTION_SPAM)).toBe(true);

    const legacySpam = `(${GMAIL_QUERY_INBOX_PRIMARY_TAB} OR in:spam)`;
    const legacyIds = parseGmailQueryToSelectionIds(legacySpam);
    expect(legacyIds.has(GMAIL_SELECTION_ALL_INBOX)).toBe(true);
    expect(legacyIds.has(GMAIL_SELECTION_SPAM)).toBe(true);
    expect(buildGmailQueryFromSelection(legacyIds)).toBe("(in:inbox OR in:spam)");
  });
});
