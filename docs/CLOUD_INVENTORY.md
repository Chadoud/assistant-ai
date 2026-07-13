# Cloud stack inventory

**Canonical cloud path:** [`cloud-node/`](../cloud-node/) — see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Removed legacy `cloud/` (2026-06)

The Python FastAPI wrapper under `cloud/` duplicated telemetry + public client-config already served by **`cloud-node/`**. It was not in CI, not used in production deploy (`scripts/deploy-cloud-api.sh` targets `cloud-node/`), and referenced broken docs (`cloud/README.md` never existed).

**Do not restore** unless you have an explicit migration plan. All account API work belongs in `cloud-node/`.

## `cloud-node/` (canonical)

- Account API, OAuth, billing hooks, crash ingest
- CI runs `cloud-node` unit tests on every PR
- Production deploy: `scripts/deploy-cloud-api.sh` + `cloud-node/.env.deploy`
- Verify after deploy: `scripts/verify-cloud-auth-api.sh` or `VERIFY_AFTER_DEPLOY=1 ./scripts/deploy-cloud-api.sh`
