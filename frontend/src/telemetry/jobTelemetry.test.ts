import { describe, expect, it } from "vitest";
import type { Job } from "../api";
import { UNCERTAIN_FOLDER } from "../constants";
import {
  buildJobCompletedProps,
  inferTelemetryJobSource,
  inferTelemetryJobSourceFromStart,
} from "./jobTelemetry";

describe("inferTelemetryJobSource", () => {
  it("maps single sources", () => {
    expect(inferTelemetryJobSource(["local"])).toBe("local");
    expect(inferTelemetryJobSource(["gmail"])).toBe("gmail");
    expect(inferTelemetryJobSource(["google-drive"])).toBe("drive");
  });

  it("returns mixed for multiple", () => {
    expect(inferTelemetryJobSource(["local", "gmail"])).toBe("mixed");
  });
});

describe("inferTelemetryJobSourceFromStart", () => {
  it("infers from start args", () => {
    expect(inferTelemetryJobSourceFromStart({ paths: ["/a"] })).toBe("local");
    expect(
      inferTelemetryJobSourceFromStart({
        paths: [],
        gmailForRun: { gmail_query: "in:inbox", max_messages: 10, gmail_import_content: "text" },
      })
    ).toBe("gmail");
    expect(inferTelemetryJobSourceFromStart({ paths: [], driveStream: true })).toBe("drive");
  });
});

describe("buildJobCompletedProps", () => {
  it("returns null for empty jobs", () => {
    expect(buildJobCompletedProps({ id: "1", status: "done", total: 0, files: [] } as unknown as Job, "under_30s", false)).toBe(
      null
    );
  });

  it("includes outcome buckets", () => {
    const job = {
      id: "1",
      status: "done",
      total: 10,
      files: [
        { status: "done", suggested_folder: UNCERTAIN_FOLDER, path: "/x/a" },
        { status: "done", suggested_folder: "Invoices", path: "/x/b" },
      ],
    } as Job;
    const props = buildJobCompletedProps(job, "under_30s", true);
    expect(props?.outcome).toBe("has_uncertain");
    expect(props?.ocr_used).toBe(true);
    expect(props?.file_count_bucket).toBe("6-20");
  });
});
