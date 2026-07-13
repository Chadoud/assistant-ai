import { describe, expect, it } from "vitest";
import { buildSelectedSourcesSummary } from "./buildSelectedSourcesSummary";

const t = (key: string) => key;

describe("buildSelectedSourcesSummary", () => {
  const base = {
    t,
    includeLocalInRun: false,
    stagedPathsLength: 0,
    gmailMergePrefsSnapshot: null,
    driveMergePrefsSnapshot: null,
    dropboxMergePrefsSnapshot: null,
    oneDriveMergePrefsSnapshot: null,
    outlookMergePrefsSnapshot: null,
    s3MergePrefsSnapshot: null,
    slackMergePrefsSnapshot: null,
    icloudMergePrefsSnapshot: null,
    infomaniakMergePrefsSnapshot: null,
    infomaniakMailMergePrefsSnapshot: null,
  };

  it("returns empty when nothing is selected", () => {
    expect(buildSelectedSourcesSummary(base)).toEqual([]);
  });

  it("includes local files with count when staged and included", () => {
    const items = buildSelectedSourcesSummary({
      ...base,
      includeLocalInRun: true,
      stagedPathsLength: 3,
    });
    expect(items).toEqual([
      { id: "local", label: "queue.workspaceLocalHeading", count: 3 },
    ]);
  });

  it("includes enabled merge sources", () => {
    const items = buildSelectedSourcesSummary({
      ...base,
      gmailMergePrefsSnapshot: { enabled: true, gmail_query: "", max_messages: 10, gmail_import_content: "both" },
      driveMergePrefsSnapshot: {
        enabled: true,
        parentId: "root",
        typeCategories: [],
        dateFilter: "any",
        sinceDate: "",
        sortOption: "name",
      },
    });
    expect(items.map((item) => item.id)).toEqual(["gmail", "drive"]);
  });
});
