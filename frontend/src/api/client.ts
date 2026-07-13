import { z } from "zod";
import { BACKEND_PORT, DEFAULT_API_BASE } from "../constants";
import { formatError } from "../utils/formatError";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || DEFAULT_API_BASE;

const SESSION_REQUEST_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `req-${Date.now()}`;

/** Stable correlation id for this renderer session (sent as X-Request-Id on API calls). */

// Resolve the per-run shared secret from Electron main (fresh each call — survives backend restarts).
export async function getAppToken(): Promise<string | null> {
  return resolveAppToken();
}

async function resolveAppToken(): Promise<string | null> {
  const getter = (window as { electronAPI?: { getBackendToken?: () => Promise<string> } }).electronAPI
    ?.getBackendToken;
  if (typeof getter !== "function") return null;
  try {
    const token = await getter();
    return token ? String(token) : null;
  } catch {
    return null;
  }
}

/** Raised when the server rejects a request with HTTP 402 (quota / license). */
export class EntitlementBlockedError extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(detail);
    this.name = "EntitlementBlockedError";
    this.detail = detail;
  }
}

const EntitlementStatusSchema = z.object({
  trialActive: z.boolean(),
  trialStartedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  trialDaysRemaining: z.number(),
  trialExpired: z.boolean(),
  licensed: z.boolean(),
  unlimitedBuild: z.boolean().optional(),
  licenseReason: z.string().nullable(),
  canAnalyze: z.boolean(),
  canUseProactive: z.boolean().optional(),
  canUseSync: z.boolean().optional(),
  hasLicenseKey: z.boolean(),
  cloudAuthRequired: z.boolean().optional(),
  cloudLoggedIn: z.boolean().optional(),
  cloudEmail: z.string().nullable().optional(),
  cloudFirstName: z.string().nullable().optional(),
  cloudLastName: z.string().nullable().optional(),
  isProductAdmin: z.boolean().optional(),
  sortServiceMode: z.enum(["local", "cloud"]).optional(),
  sortServiceConfigured: z.boolean().optional(),
  sortCredentialsManaged: z.boolean().optional(),
  sortCredentialsExpiresAt: z.number().nullable().optional(),
  sortSyncLastError: z.string().nullable().optional(),
  sortEntitledModels: z.array(z.string()).optional(),
});

export type EntitlementStatus = z.infer<typeof EntitlementStatusSchema>;

function detailPartToString(part: unknown): string {
  if (part == null) return "";
  if (typeof part === "string") return part;
  if (typeof part === "number" || typeof part === "boolean") return String(part);
  if (Array.isArray(part)) return part.map(detailPartToString).filter(Boolean).join("; ");
  if (typeof part === "object") {
    const o = part as { msg?: unknown; message?: unknown };
    if (typeof o.msg === "string") return o.msg;
    if (typeof o.message === "string") return o.message;
    try {
      return JSON.stringify(part);
    } catch {
      return String(part);
    }
  }
  return String(part);
}

/** Parse a non-OK response into a human-readable error message. */
export async function extractApiError(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const j = JSON.parse(body) as { detail?: unknown };
    if (j.detail === undefined || j.detail === null) {
      /* use raw body below */
    } else if (typeof j.detail === "string") {
      return j.detail;
    } else {
      const s = detailPartToString(j.detail);
      if (s) return s;
    }
  } catch {
    /* fall through to raw body */
  }
  return body;
}

/** Consistent message when fetch fails before an HTTP response (offline, wrong port, etc.). */
export function mapFetchFailureToError(e: unknown): Error {
  const msg = formatError(e);
  if (msg.toLowerCase().includes("failed to fetch") || e instanceof TypeError) {
    return new Error(
      `Cannot reach the API at ${API_BASE} (is the backend running on port ${BACKEND_PORT}?)`
    );
  }
  return new Error(msg);
}

/**
 * Returns request headers that always include X-App-Token when running in Electron.
 * Use this in any raw `fetch()` call that can't go through `request()`.
 */
export async function getApiHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const appToken = await resolveAppToken();
  const headers: Record<string, string> = { "X-Request-Id": SESSION_REQUEST_ID };
  if (appToken) headers["X-App-Token"] = appToken;
  return { ...headers, ...(extra ?? {}) };
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const appToken = await resolveAppToken();
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": SESSION_REQUEST_ID,
  };
  if (appToken) baseHeaders["X-App-Token"] = appToken;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...baseHeaders, ...((options?.headers as Record<string, string> | undefined) ?? {}) },
    });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw mapFetchFailureToError(e);
  }
  if (!res.ok) {
    if (res.status === 402) {
      throw new EntitlementBlockedError(await extractApiError(res));
    }
    throw new Error(await extractApiError(res));
  }
  return res.json();
}

/**
 * POST multipart form data (e.g. browser file uploads). Do not set `Content-Type`; the runtime adds the boundary.
 */
export async function requestMultipart<T>(path: string, formData: FormData, init?: RequestInit): Promise<T> {
  const appToken = await resolveAppToken();
  // Omit Content-Type so the browser sets the multipart boundary automatically.
  const baseHeaders: Record<string, string> = {};
  if (appToken) baseHeaders["X-App-Token"] = appToken;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body: formData,
      ...init,
      headers: { ...baseHeaders, ...((init?.headers as Record<string, string> | undefined) ?? {}) },
    });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw mapFetchFailureToError(e);
  }
  if (!res.ok) {
    if (res.status === 402) {
      throw new EntitlementBlockedError(await extractApiError(res));
    }
    throw new Error(await extractApiError(res));
  }
  return res.json();
}

/** Fetch + Zod-validate a response. Throws on schema mismatch in all environments. */
export async function requestValidated<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const raw = await request<unknown>(path, options);
  const result = schema.safeParse(raw);
  if (!result.success) {
    console.error("[api] schema mismatch on", path, result.error.flatten());
    // Fail closed: casting an unvalidated payload to T risks logic bugs and unsafe assumptions.
    throw new Error(`[api] Unexpected response shape from ${path}`);
  }
  return result.data;
}

export function entitlementStatus() {
  return requestValidated("/entitlement/status", EntitlementStatusSchema);
}

export function health() {
  return request<{ status: string }>("/health");
}

const VideoIngestMetaSchema = z.object({
  ffmpeg_path: z.string().nullable(),
  ffprobe_path: z.string().nullable(),
  can_decode_video: z.boolean(),
  vendored_bundle_detected: z.boolean(),
  frame_count: z.number(),
  max_duration_sec: z.number(),
  max_extract_sec: z.number(),
  max_transcript_chars: z.number(),
  ffmpeg_timeout_sec: z.number(),
  ffprobe_timeout_sec: z.number(),
  stt_enabled: z.boolean(),
  stt_model: z.string(),
  debug_log: z.boolean(),
});

export type VideoIngestMeta = z.infer<typeof VideoIngestMetaSchema>;

export function videoIngestMeta() {
  return requestValidated("/meta/video", VideoIngestMetaSchema);
}
