# After the beta pre-release (operations)

Short checklist once testers can download builds.

## Week one

| Action | Notes |
|--------|--------|
| **Crash dashboard** | If you enabled `VITE_SENTRY_DSN`, watch the Sentry project for spikes and new issues. |
| **Feedback triage** | Check the URL you set in `VITE_BETA_FEEDBACK_URL`, GitHub Issues/Discussions, or email. |
| **In-app feedback** | Batches go to the local backend SQLite on each device unless you add central ingest; treat as supplemental. |
| **Responder template** | Ask for: OS version, app version, steps, and diagnostics paste (no paths). |

## If you need aggregate product analytics

Today’s opt-in events land in **local** `telemetry.sqlite` per machine. To see cross-user trends you would need a follow-up: HTTPS ingest, app-configured endpoint, or a voluntary export script for willing testers—not part of the initial pre-release cut.

## Iteration

- Tag `vX.Y.Z-beta.N+1` after fixes; keep pre-release until you are ready for a stable or signed wide release.
