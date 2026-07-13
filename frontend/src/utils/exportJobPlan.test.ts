import { describe, expect, it } from "vitest";
import type { Job } from "../api";
import { buildJobPlanCsvText } from "./exportJobPlan";

function minimalJob(overrides: Partial<Job> = {}): Job {
  const base: Job = {
    id: "job-export-test",
    session_id: "sess-1",
    phase: "awaiting_approval",
    total: 1,
    completed: 1,
    last_processed_index: 0,
    pause_requested: false,
    cancel_requested: false,
    files: [
      {
        path: "/tmp/example.pdf",
        name: "example.pdf",
        status: "review_ready",
        suggested_folder: "Invoices",
        final_folder: "Invoices",
        confidence: 0.92,
        reason: "test",
        approved: true,
        dest_path: null,
        error: null,
        entry_id: null,
        analyze_duration_ms: 120,
        analyze_extract_ms: 15,
        analyze_briefing_ms: 0,
        analyze_classify_ms: 105,
      },
    ],
    status: "awaiting_approval",
    error: null,
    config: {
      output_dir: "/out",
      model: "mistral:latest",
      mode: "copy",
      language: "English",
    },
  };
  return { ...base, ...overrides };
}

describe("buildJobPlanCsvText", () => {
  it("includes analyze phase timing columns in the header row", () => {
    const csv = buildJobPlanCsvText(minimalJob());
    const header = csv.replace(/^\uFEFF/, "").split("\n")[0] ?? "";
    expect(header).toContain("analyze_duration_ms");
    expect(header).toContain("analyze_extract_ms");
    expect(header).toContain("analyze_briefing_ms");
    expect(header).toContain("analyze_classify_ms");
  });

  it("includes classify audit debug columns in the header row", () => {
    const csv = buildJobPlanCsvText(minimalJob());
    const header = csv.replace(/^\uFEFF/, "").split("\n")[0] ?? "";
    expect(header).toContain("llm_reason");
    expect(header).toContain("detected_language");
    expect(header).toContain("document_briefing_snippet");
    expect(header).toContain("classify_audit_json");
    expect(header).toContain("job_structure_template_enabled");
    expect(header).toContain("structure_active");
    expect(header).toContain("structure_values_json");
    expect(header).toContain("structure_path_provisional");
    expect(header).toContain("structure_auto_tail");
    expect(header).toContain("structure_cap_rewritten");
    expect(header).toContain("structure_rerank_skipped");
  });

  it("writes classify audit fields on data rows", () => {
    const csv = buildJobPlanCsvText(
      minimalJob({
        files: [
          {
            ...minimalJob().files[0]!,
            llm_reason: "Mentions Hurghada utility quote",
            detected_language: "English",
            document_briefing: "Egyptian electricity connection cost estimate.",
            decision_trace: {
              classify_audit: {
                geo_hits: ["hurghada", "egp"],
                llm_rerank_gap: 0.73,
              },
            },
          },
        ],
      })
    );
    const row = csv.replace(/^\uFEFF/, "").split("\n")[1] ?? "";
    expect(row).toContain("Mentions Hurghada utility quote");
    expect(row).toContain("English");
    expect(row).toContain("Egyptian electricity connection cost estimate.");
    expect(row).toContain("hurghada");
  });

  it("writes structure debug columns on data rows", () => {
    const csv = buildJobPlanCsvText(
      minimalJob({
        config: {
          output_dir: "/out",
          model: "mistral:latest",
          mode: "copy",
          language: "English",
          sort_structure_template: {
            enabled: true,
            modules: [{ id: "c", theme: "country", max_folders: 20, children: [] }],
          },
        },
        files: [
          {
            ...minimalJob().files[0]!,
            suggested_folder: "Egypt/Bankstatements",
            final_folder: "Egypt/Bankstatements",
            structure_values: { country: "Egypt" },
            structure_path_provisional: "Egypt/Bankstatements",
            structure_cap_rewritten: false,
            decision_trace: {
              structure_template: true,
              structure_parse_failed: false,
              structure_auto_tail: "Bankstatements",
              structure_rerank_skipped: true,
            },
          },
        ],
      })
    );
    const header = csv.replace(/^\uFEFF/, "").split("\n")[0] ?? "";
    expect(header).toContain("sort_plan_csv_schema_version");
    expect(header.split(",").indexOf("sort_plan_csv_schema_version")).toBeGreaterThan(-1);
    const row = csv.replace(/^\uFEFF/, "").split("\n")[1] ?? "";
    expect(row).toContain("true");
    expect(row).toContain("Egypt/Bankstatements");
    expect(row).toContain('""country"":""Egypt""');
    expect(row).toContain("Bankstatements");
  });

  it("writes timing values on data rows", () => {
    const csv = buildJobPlanCsvText(minimalJob());
    const lines = csv.replace(/^\uFEFF/, "").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const row = lines[1] ?? "";
    expect(row).toContain("120");
    expect(row).toContain("15");
    expect(row).toContain("105");
  });

  it("includes import-debug columns and repeats job telemetry on each data row", () => {
    const csv = buildJobPlanCsvText(
      minimalJob({
        drive_import_fetch_failures: 3,
        drive_import_failed_file_ids: ["a", "b"],
        drive_listing_discovered: 40,
        drive_files_in_source: 100,
        gmail_export_attachment_fetch_failures: 2,
        files: [
          {
            path: "C:/AppData/drive_sort_staging/batch-9/doc.pdf",
            name: "doc.pdf",
            status: "review_ready",
            suggested_folder: "Invoices",
            final_folder: "Invoices",
            confidence: 0.9,
            reason: "ok",
            approved: true,
            dest_path: null,
            error: null,
            entry_id: "ent-1",
            size_bytes: 999,
          },
        ],
      })
    );
    const header = csv.replace(/^\uFEFF/, "").split("\n")[0] ?? "";
    expect(header).toContain("sort_plan_csv_schema_version");
    expect(header).toContain("drive_import_fetch_failures");
    expect(header).toContain("import_fetch_failures_gmail_plus_drive");
    expect(header).toContain("import_staging_folder_marker");
    const row = csv.replace(/^\uFEFF/, "").split("\n")[1] ?? "";
    expect(row).toContain(",3,");
    expect(row).toContain(",5,ent-1,999,drive_sort_staging,batch-9");
    expect(row).toContain(`"[""a"",""b""]"`);
  });

  it("parses staging marker from Windows paths", () => {
    const csv = buildJobPlanCsvText(
      minimalJob({
        files: [
          {
            ...minimalJob().files[0]!,
            path: "C:\\Users\\x\\AppData\\drive_sort_staging\\abc12\\x.pdf",
            name: "x.pdf",
          },
        ],
      })
    );
    const row = csv.replace(/^\uFEFF/, "").split("\n")[1] ?? "";
    expect(row).toContain("drive_sort_staging,abc12");
  });
});
