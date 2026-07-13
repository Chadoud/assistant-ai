import { describe, expect, it } from "vitest";
import type { FileEntry, Job } from "../../api";
import { deriveSortJobSources } from "./deriveSortJobSources";

/** Minimal job + file row for source derivation (avoids coupling tests to full JobSchema). */
function jobWithFiles(files: FileEntry[], extra: Partial<Job> = {}): Job {
  return {
    id: "j1",
    session_id: "s1",
    phase: "analyzing",
    total: files.length,
    completed: 0,
    last_processed_index: 0,
    pause_requested: false,
    cancel_requested: false,
    files,
    status: "running",
    error: null,
    ...extra,
  } as Job;
}

const file = (path: string): FileEntry =>
  ({
    path,
    name: "x",
    status: "classifying",
    suggested_folder: null,
    final_folder: null,
    confidence: 0,
    reason: null,
    approved: false,
    dest_path: null,
    error: null,
    entry_id: null,
  }) as FileEntry;

describe("deriveSortJobSources", () => {
  it("does not infer Google Drive from shared drive_* telemetry when only OneDrive staging paths exist", () => {
    const job = jobWithFiles(
      [file("C:\\Users\\admin\\AppData\\Roaming\\exosites-user-data\\onedrive_sort_staging\\ab\\memo.docx")],
      {
        drive_import_fetching: true,
        drive_listing_discovered: 17,
        drive_files_in_source: 100,
      }
    );
    const sources = deriveSortJobSources(job);
    expect(sources).toContain("onedrive");
    expect(sources).not.toContain("google-drive");
  });

  it("includes Google Drive when paths use drive_sort_staging", () => {
    const job = jobWithFiles([
      file("C:\\Users\\admin\\AppData\\...\\drive_sort_staging\\hex\\a.pdf"),
    ]);
    expect(deriveSortJobSources(job)).toContain("google-drive");
  });

  it("shows all selected sources from job_import_sources before files arrive", () => {
    const job = jobWithFiles([], {
      job_import_sources: ["gmail", "google-drive", "dropbox"],
      gmail_query: "in:inbox",
    });
    const sources = deriveSortJobSources(job);
    expect(sources).toEqual(["gmail", "google-drive", "dropbox"]);
  });
});
