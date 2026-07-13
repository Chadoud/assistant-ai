# Cloud sort — privacy & retention (Phase 0)

When **`EXOSITES_CLOUD_SORT_WORKER=1`**, each file in a sort job is **uploaded to the Exo LLM VPS** for OCR, extraction, and classification. Apply (move/copy) still runs on the user's device.

## User-facing commitments (draft for Terms/Privacy)

- Files are transmitted **only to sort** subscribed users who start a job.
- Uploads are stored **temporarily** on VPS disk (`SORT_WORKER_TMP_DIR`), deleted when the analyze request completes and within **15 minutes** after job terminal state (TTL sweeper — Phase 4 ops).
- Exo does **not** use uploaded content to train models.
- Hosting: Exo LLM VPS (Infomaniak Cloud Server, EU).

## Technical controls

| Control | Implementation |
|---------|----------------|
| Auth | Bearer token (LiteLLM virtual key from sign-in) validated on `sort-worker` |
| Max size | `SORT_WORKER_MAX_UPLOAD_BYTES` (default 100 MB per file) |
| Path safety | Random temp names; no user path segments on server |
| Telemetry | No file names or paths in analytics (existing redact policy) |
| Multi-tenant | Job/file IDs scoped per account when job API lands (Phase 2+) |

## Enable checklist before production

- [ ] Legal review of upload disclosure
- [ ] Deploy `sort-worker` overlay on staging
- [ ] Verify `DELETE` / TTL on `/mnt/data` sort tmp
- [ ] Load test with upload payload in capacity baseline

See [`CLOUD_SORT_VPS_PLAN.md`](CLOUD_SORT_VPS_PLAN.md).
