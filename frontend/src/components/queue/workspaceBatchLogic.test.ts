import { describe, expect, it } from "vitest";
import {
  buildGmailAnalyzeSliceFromMerge,
  buildJobFilePaths,
  computeWorkspaceBatchButtonDisabled,
  resolveWorkspacePrepStallMessageKey,
  wantsStagedLocal,
  WORKSPACE_PREP_STALL_MESSAGE,
} from "./workspaceBatchLogic";
import type { GmailMergePrefs } from "../workspace/GmailWorkspaceSortBlock";
import { GMAIL_QUERY_DEFAULT_INBOX } from "../../utils/gmailSearchCategories";

describe("workspaceBatchLogic", () => {
  it("buildGmailAnalyzeSliceFromMerge returns null when disabled or null", () => {
    expect(buildGmailAnalyzeSliceFromMerge(null)).toBeNull();
    expect(
      buildGmailAnalyzeSliceFromMerge({ enabled: false } as GmailMergePrefs)
    ).toBeNull();
  });

  it("buildGmailAnalyzeSliceFromMerge uses default query when empty", () => {
    const slice = buildGmailAnalyzeSliceFromMerge({
      enabled: true,
      gmail_query: "   ",
      max_messages: 10,
      gmail_import_content: "text",
    } as GmailMergePrefs);
    expect(slice).not.toBeNull();
    expect(slice!.gmail_query).toBe(GMAIL_QUERY_DEFAULT_INBOX);
  });

  it("buildJobFilePaths combines local and drive paths", () => {
    expect(
      buildJobFilePaths(true, ["/a", "/b"], ["/d1"])
    ).toEqual(["/a", "/b", "/d1"]);
    expect(buildJobFilePaths(false, ["/a"], ["/d1"])).toEqual(["/d1"]);
  });

  it("buildJobFilePaths drops video thumbnail artifacts when parent video exists", () => {
    expect(
      buildJobFilePaths(
        false,
        [],
        ["/x/clip.mp4", "/x/clip.video_thumb.jpg", "/x/other.video_thumb.jpg"]
      )
    ).toEqual(["/x/clip.mp4", "/x/other.video_thumb.jpg"]);
  });

  it("wantsStagedLocal", () => {
    expect(wantsStagedLocal(true, 0)).toBe(false);
    expect(wantsStagedLocal(true, 1)).toBe(true);
    expect(wantsStagedLocal(false, 1)).toBe(false);
  });

  it("resolveWorkspacePrepStallMessageKey matches batch sources", () => {
    expect(
      resolveWorkspacePrepStallMessageKey({ gmailOn: false, driveOn: true, wantsLocal: false })
    ).toBe(WORKSPACE_PREP_STALL_MESSAGE.drive);
    expect(
      resolveWorkspacePrepStallMessageKey({ gmailOn: false, driveOn: false, wantsLocal: true })
    ).toBe(WORKSPACE_PREP_STALL_MESSAGE.local);
    expect(
      resolveWorkspacePrepStallMessageKey({ gmailOn: true, driveOn: false, wantsLocal: false })
    ).toBe(WORKSPACE_PREP_STALL_MESSAGE.mail);
    expect(
      resolveWorkspacePrepStallMessageKey({ gmailOn: true, driveOn: true, wantsLocal: false })
    ).toBe(WORKSPACE_PREP_STALL_MESSAGE.mixed);
    expect(
      resolveWorkspacePrepStallMessageKey({ gmailOn: true, driveOn: false, wantsLocal: true })
    ).toBe(WORKSPACE_PREP_STALL_MESSAGE.mixed);
  });

  it("computeWorkspaceBatchButtonDisabled — disabled when sortInputDisabled or starting", () => {
    expect(
      computeWorkspaceBatchButtonDisabled({
        sortInputDisabled: true,
        workspaceBatchStarting: false,
        includeLocalInRun: true,
        stagedPathsLength: 1,
        gmailMergeEnabled: false,
        driveMergeEnabled: false,
      })
    ).toBe(true);
    expect(
      computeWorkspaceBatchButtonDisabled({
        sortInputDisabled: false,
        workspaceBatchStarting: true,
        includeLocalInRun: true,
        stagedPathsLength: 1,
        gmailMergeEnabled: false,
        driveMergeEnabled: false,
      })
    ).toBe(true);
  });

  it("computeWorkspaceBatchButtonDisabled — enabled by any single source", () => {
    const base = {
      sortInputDisabled: false,
      workspaceBatchStarting: false,
      includeLocalInRun: false,
      stagedPathsLength: 0,
      gmailMergeEnabled: false,
      driveMergeEnabled: false,
    };
    expect(computeWorkspaceBatchButtonDisabled({ ...base, gmailMergeEnabled: true })).toBe(false);
    expect(computeWorkspaceBatchButtonDisabled({ ...base, driveMergeEnabled: true })).toBe(false);
    expect(computeWorkspaceBatchButtonDisabled({ ...base, dropboxMergeEnabled: true })).toBe(false);
    expect(computeWorkspaceBatchButtonDisabled({ ...base, oneDriveMergeEnabled: true })).toBe(false);
    expect(computeWorkspaceBatchButtonDisabled({ ...base, outlookMergeEnabled: true })).toBe(false);
    expect(computeWorkspaceBatchButtonDisabled({ ...base, s3MergeEnabled: true })).toBe(false);
    expect(computeWorkspaceBatchButtonDisabled({ ...base, slackMergeEnabled: true })).toBe(false);
    expect(computeWorkspaceBatchButtonDisabled({ ...base, icloudMergeEnabled: true })).toBe(false);
    expect(computeWorkspaceBatchButtonDisabled({ ...base, infomaniakMergeEnabled: true })).toBe(false);
    expect(
      computeWorkspaceBatchButtonDisabled({ ...base, includeLocalInRun: true, stagedPathsLength: 1 })
    ).toBe(false);
  });

  it("computeWorkspaceBatchButtonDisabled — disabled when nothing selected", () => {
    expect(
      computeWorkspaceBatchButtonDisabled({
        sortInputDisabled: false,
        workspaceBatchStarting: false,
        includeLocalInRun: false,
        stagedPathsLength: 0,
        gmailMergeEnabled: false,
        driveMergeEnabled: false,
      })
    ).toBe(true);
  });

  it("resolveWorkspacePrepStallMessageKey — new providers count as cloud (drive stall or mixed)", () => {
    const base = { gmailOn: false, driveOn: false, wantsLocal: false };
    expect(resolveWorkspacePrepStallMessageKey({ ...base, dropboxOn: true })).toBe(WORKSPACE_PREP_STALL_MESSAGE.drive);
    expect(resolveWorkspacePrepStallMessageKey({ ...base, s3On: true })).toBe(WORKSPACE_PREP_STALL_MESSAGE.drive);
    expect(resolveWorkspacePrepStallMessageKey({ ...base, slackOn: true })).toBe(WORKSPACE_PREP_STALL_MESSAGE.drive);
    expect(resolveWorkspacePrepStallMessageKey({ ...base, icloudOn: true })).toBe(WORKSPACE_PREP_STALL_MESSAGE.drive);
    expect(resolveWorkspacePrepStallMessageKey({ ...base, infomaniakMailOn: true })).toBe(
      WORKSPACE_PREP_STALL_MESSAGE.drive
    );
    // New cloud + gmail → mixed
    expect(
      resolveWorkspacePrepStallMessageKey({ ...base, gmailOn: true, dropboxOn: true })
    ).toBe(WORKSPACE_PREP_STALL_MESSAGE.mixed);
  });
});
