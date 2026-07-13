# Sync auth failure triage

## Symptoms

- Settings → Sync shows `not_logged_in` or `invalid_token`
- Mobile/desktop cannot pull blobs

## Steps

1. Confirm `EXOSITES_CLOUD_URL` is set and reachable (HTTPS).
2. Log out and log in again (Settings → Account).
3. Check system clock — JWT validation fails on large skew.
4. Inspect `userData/sync_runs.jsonl` for `sync_run_id` and error codes.

## Resolution

- Refresh cloud session via Electron cloud auth.
- Re-enable sync after Pro license is active.
