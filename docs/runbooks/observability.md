# Observability — metrics and correlation

**Last updated:** 2026-06-16

## Correlation IDs (desktop backend)

Every HTTP request from the renderer includes **`X-Request-Id`** (`frontend/src/api/client.ts`). The Python backend:

- Echoes the header on responses
- Logs one JSON line per request (`backend/request_logging.py`) with `request_id`
- Stores the id in `request_context.get_request_id()` for the duration of the request

Use the id when matching user reports to server logs: Help → Copy diagnostics, or grep backend stderr for `"request_id":"<hex>"`.

Full distributed tracing (OpenTelemetry) is **deferred** — correlation id is the v1 trace primitive.

## Cloud API metrics

Prometheus text exposition:

```bash
curl -s https://api.exosites.ch/metrics
```

Metrics (prefix `exo_cloud_`):

| Metric | Type | Meaning |
|--------|------|---------|
| `exo_cloud_uptime_seconds` | gauge | Process uptime |
| `exo_cloud_http_requests_total` | counter | Requests by method, path, status |

Scrape from your monitoring stack (Grafana Cloud, Datadog agent, etc.). Restrict ingress if needed — metrics contain no user PII but expose traffic shape.

## Health vs readiness

| Endpoint | Service | Use |
|----------|---------|-----|
| `GET /health` | cloud-node | Liveness + DB ping |
| `GET /ready` | Python backend | Ollama, SQLite stores, disk |
| `GET /health` | Python backend | Simple ok |

## Sentry

Renderer opt-in crashes → Sentry when `VITE_SENTRY_DSN` is set. Alert rules are configured in the Sentry project UI — see [sentry-alerts.md](./sentry-alerts.md).

## Related

- [incident-response.md](./incident-response.md)
- [SECURITY.md](../../SECURITY.md)
