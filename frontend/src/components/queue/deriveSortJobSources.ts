import type { FileEntry, Job } from "../../api";

/**
 * UI chips for connectors + local filesystem — matches ``ExternalSourceBrandIcons`` where possible.
 */
export type SortJobSourceId =
  | "local"
  | "gmail"
  | "google-drive"
  | "dropbox"
  | "onedrive"
  | "outlook"
  | "s3"
  | "slack"
  | "icloud"
  | "infomaniak"
  | "infomaniak-mail";

const SOURCE_ORDER: SortJobSourceId[] = [
  "local",
  "gmail",
  "google-drive",
  "outlook",
  "infomaniak-mail",
  "dropbox",
  "onedrive",
  "s3",
  "slack",
  "icloud",
  "infomaniak",
];

/** Importer staging folder segment names under Electron user-data (see ``electron/integrations/ipc.js``). */
const CONNECTOR_PATH_MARKERS: readonly { segment: string; id: Exclude<SortJobSourceId, "local"> }[] = [
  { segment: ".exosites_gmail_stream", id: "gmail" },
  { segment: "drive_sort_staging", id: "google-drive" },
  { segment: "dropbox_sort_staging", id: "dropbox" },
  { segment: "onedrive_sort_staging", id: "onedrive" },
  { segment: "outlook_sort_staging", id: "outlook" },
  { segment: "s3_sort_staging", id: "s3" },
  { segment: "slack_sort_staging", id: "slack" },
  { segment: "icloud_sort_staging", id: "icloud" },
  { segment: "infomaniak_sort_staging", id: "infomaniak" },
  { segment: "infomaniak_mail_sort_staging", id: "infomaniak-mail" },
];

function normalizedPathSegments(p: string): string {
  return p.trim().replace(/\\/g, "/").toLowerCase();
}

/** Match on whole path segments so e.g. ``onedrive_sort_staging`` is not treated as ``drive_sort_staging``. */
function pathHasSegment(norm: string, segmentLower: string): boolean {
  const parts = norm.split(/[/\\]+/).filter(Boolean);
  return parts.some((seg) => seg.toLowerCase() === segmentLower);
}

/** True when ``path`` is under a connector importer staging folder (not the user's originals). */
function isConnectorImportStagingPath(path: string): boolean {
  const norm = normalizedPathSegments(path);
  return CONNECTOR_PATH_MARKERS.some((m) => pathHasSegment(norm, m.segment.toLowerCase()));
}

function connectorsFromPaths(files: readonly FileEntry[]): Set<Exclude<SortJobSourceId, "local">> {
  const out = new Set<Exclude<SortJobSourceId, "local">>();
  for (const row of CONNECTOR_PATH_MARKERS) {
    const seg = row.segment.toLowerCase();
    for (const f of files) {
      if (!f.path?.trim()) continue;
      if (pathHasSegment(normalizedPathSegments(f.path), seg)) {
        out.add(row.id);
        break;
      }
    }
  }
  return out;
}

/**
 * Ordered list of sources participating in this job (Gmail flags + importer paths + real local paths).
 *
 * Do **not** treat generic ``job.drive_*`` fields (``drive_listing_discovered``, ``drive_import_fetching``,
 * etc.) as Google Drive. Progressive **OneDrive, Dropbox, Outlook**, and Google Drive all use the same
 * drive-stream chunk pipeline and share those keys — see ``runProgressiveCloudImportLoop``. Connector
 * identity comes from staging path segments (``drive_sort_staging`` vs ``onedrive_sort_staging``, …).
 */
export function deriveSortJobSources(job: Job): SortJobSourceId[] {
  const merged = new Set<SortJobSourceId>();

  for (const raw of job.job_import_sources ?? []) {
    if (SOURCE_ORDER.includes(raw as SortJobSourceId)) {
      merged.add(raw as SortJobSourceId);
    }
  }

  const hasGmailScope = job.gmail_import_content != null || Boolean(job.gmail_query?.trim());
  if (hasGmailScope) merged.add("gmail");

  connectorsFromPaths(job.files).forEach((id) => merged.add(id));

  let hasNonImportedOriginal = false;
  for (const f of job.files) {
    const p = f.path?.trim() ?? "";
    if (!p) continue;
    if (!isConnectorImportStagingPath(p)) {
      hasNonImportedOriginal = true;
      break;
    }
  }
  if (hasNonImportedOriginal) merged.add("local");

  const rank = SOURCE_ORDER.reduce<Partial<Record<SortJobSourceId, number>>>((acc, id, idx) => {
    acc[id] = idx;
    return acc;
  }, {});

  return [...merged].sort((a, b) => (rank[a] ?? 99) - (rank[b] ?? 99));
}
