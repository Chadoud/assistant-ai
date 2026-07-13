# Sentry alert rules (ops configuration)

**Owner:** Platform / on-call  
**Last updated:** 2026-06-16  
**Scope:** Sentry project for Exo desktop renderer (opt-in crash reports)

This file documents **recommended alert rules** to configure in the Sentry UI. Rules live outside the repo.

## Prerequisites

- Production builds set `VITE_SENTRY_DSN`
- Environment tag distinguishes `production` vs `staging` releases

## Recommended rules

| Rule | Condition | Action |
|------|-----------|--------|
| **New issue spike** | > 10 events / 15 min on `level:error` in `production` | Slack + email on-call |
| **Regression** | Issue marked resolved reappears in `production` | Slack |
| **Release health** | Crash-free sessions < 99% for latest release (24h window) | Page on-call (SEV-2) |

## Tuning notes

- Filter test builds: exclude `environment:development` and internal `instance_id` allowlist if used.
- Crash ingest via cloud API (`POST /v1/crash-reports`) is separate — monitor via DB row growth and [observability.md](./observability.md) metrics, not Sentry alone.

## Verification

After changing rules, trigger a test event from a staging build with opt-in crash reporting enabled and confirm the notification channel receives it.
