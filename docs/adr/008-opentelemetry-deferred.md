# ADR-008: OpenTelemetry — deferred for v1

## Status

Accepted — **Deferred** (PR-4.7, 2026-06-16)

## Context

Production readiness audit requested distributed tracing for operator visibility. Full OpenTelemetry (OTLP export, collector, dashboards) adds deployment complexity for a **local-first desktop** product where the primary failure mode is a single user's machine, not a multi-tenant fleet.

v1 already ships:

- `X-Request-Id` on every API request (renderer → Python backend)
- JSON request logs with `request_id` in `backend/request_logging.py`
- `request_context.get_request_id()` for in-process correlation
- Cloud `GET /metrics` for relay traffic shape

## Decision

**Defer OpenTelemetry SDK + OTLP export** until one of:

1. Managed cloud relay SLOs require cross-service traces (cloud-node ↔ MariaDB ↔ ingest), or
2. Support volume justifies a shared observability stack (Grafana Cloud, Datadog, etc.)

Until then, operators use [`docs/runbooks/observability.md`](../runbooks/observability.md) and Help → Copy diagnostics.

## Consequences

- No extra runtime dependency or egress from user desktops for tracing.
- Revisit when shipping multi-region relay or 24/7 on-call for cloud API.
