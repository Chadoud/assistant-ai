const MAX_CRUMBS = 30;

const PATH_RE = /(?:[A-Za-z]:\\[^\s]*|\/(?:Users|home)\/[^\s]+)/gi;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

const ALLOWED_META_KEYS = new Set([
  "tab",
  "feature",
  "tool_name",
  "platform",
  "provider",
  "method",
  "status",
  "outcome",
  "error_class",
  "channel",
]);

export type BreadcrumbType = "ui" | "api" | "tool";

export type Breadcrumb = {
  ts: number;
  type: BreadcrumbType;
  action: string;
  meta?: Record<string, string | number | boolean>;
};

const ring: Breadcrumb[] = [];

function scrubValue(value: string): string {
  return value.replace(PATH_RE, "[path]").replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
}

function scrubMeta(meta: Record<string, string | number | boolean> | undefined): Breadcrumb["meta"] {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, val] of Object.entries(meta)) {
    if (!ALLOWED_META_KEYS.has(key)) continue;
    if (typeof val === "string") {
      out[key] = scrubValue(val).slice(0, 128);
    } else {
      out[key] = val;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Append one scrubbed breadcrumb (ring buffer, max 30). */
export function pushBreadcrumb(crumb: Omit<Breadcrumb, "ts"> & { ts?: number }): void {
  const action = scrubValue(String(crumb.action || "unknown")).slice(0, 128);
  ring.push({
    ts: crumb.ts ?? Date.now(),
    type: crumb.type,
    action,
    meta: scrubMeta(crumb.meta),
  });
  while (ring.length > MAX_CRUMBS) {
    ring.shift();
  }
}

/** Snapshot for crash payloads — never mutates the ring. */
export function getBreadcrumbs(): Breadcrumb[] {
  return ring.map((c) => ({ ...c, meta: c.meta ? { ...c.meta } : undefined }));
}

/** Test helper — clears the in-memory ring. */
export function clearBreadcrumbsForTests(): void {
  ring.length = 0;
}
