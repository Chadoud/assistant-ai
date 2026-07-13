/**
 * API client for opt-in screen-activity capture + the activity timeline.
 * Raw screenshots are never stored server-side; only distilled summaries.
 */

import { z } from "zod";
import { request, requestValidated } from "./client";

const ActivityStatusSchema = z.object({
  running: z.boolean(),
  interval_sec: z.number(),
  retention_days: z.number(),
  exclusions: z.array(z.string()),
  paused: z.boolean(),
  paused_until: z.string().nullable(),
  last_capture_at: z.string().nullable(),
  last_error: z.string().nullable(),
  last_notice: z.string().nullable(),
  captured_count: z.number(),
});

export type ActivityStatus = z.infer<typeof ActivityStatusSchema>;

const ActivityEntrySchema = z.object({
  id: z.number(),
  app: z.string(),
  title: z.string(),
  summary: z.string(),
  captured_at: z.string(),
});

export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

export function fetchActivityStatus(): Promise<ActivityStatus> {
  return requestValidated("/activity/status", ActivityStatusSchema);
}

export function startActivityCapture(opts?: {
  interval_sec?: number;
  retention_days?: number;
}): Promise<ActivityStatus> {
  return requestValidated("/activity/start", ActivityStatusSchema, {
    method: "POST",
    body: JSON.stringify(opts ?? {}),
  });
}

export function stopActivityCapture(): Promise<ActivityStatus> {
  return requestValidated("/activity/stop", ActivityStatusSchema, { method: "POST" });
}

export function pauseActivityCapture(minutes: number): Promise<ActivityStatus> {
  return requestValidated("/activity/pause", ActivityStatusSchema, {
    method: "POST",
    body: JSON.stringify({ minutes }),
  });
}

export function resumeActivityCapture(): Promise<ActivityStatus> {
  return requestValidated("/activity/resume", ActivityStatusSchema, { method: "POST" });
}

export function setActivityExclusions(exclusions: string[]): Promise<ActivityStatus> {
  return requestValidated("/activity/exclusions", ActivityStatusSchema, {
    method: "PUT",
    body: JSON.stringify({ exclusions }),
  });
}

export function fetchActivityTimeline(limit = 200): Promise<ActivityEntry[]> {
  return requestValidated(`/activity/timeline?limit=${limit}`, z.array(ActivityEntrySchema));
}

export async function clearActivityTimeline(): Promise<void> {
  await request<unknown>("/activity/timeline", { method: "DELETE" });
}
