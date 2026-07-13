# Full production ship program

**Purpose:** Single checklist for Tracks A–E (relay, legal, desktop `v*`, mobile beta, public stores).  
**Engineering status:** Client + CI scaffolding complete; ops steps below require credentials and counsel.

## Track A — Cloud + GO SYNC (blocks mobile value)

| Step | Action | Owner |
|------|--------|-------|
| A1 | Merge migration 004 in deploy (`scripts/deploy-cloud-api.sh`) | Eng ✅ |
| A2 | Deploy: `VERIFY_AFTER_DEPLOY=1 ./scripts/deploy-cloud-api.sh` or GitHub **Deploy Cloud API** workflow | Infra |
| A3 | Smoke: `npm run verify:go-sync` (included in `verify:production`) | Eng |
| A4 | Manual E2E: desktop Sync ON → QR → mobile pair → Sync now | QA |

**Exit:** `GET /health` shows `sync_relay: true`; push/pull round-trip passes.

## Track B — Legal + compliance (blocks public stores)

| Step | Action | Owner | Status |
|------|--------|-------|--------|
| B1 | Counsel review **exosites-agency** `appPrivacy.ts` + `appTerms.ts` (mobile + GO SYNC) | Legal | ⏳ |
| B2 | Host Privacy + Terms at stable HTTPS URLs | Product | ✅ exosites.ch |
| B3 | `npm run verify:legal-urls` passes | Eng | ✅ |
| B4 | `LEGAL_TERMS_BUNDLE_VERSION` aligned with published text | Eng | ✅ 2026-06-18 |
| B5 | Mark PR-1.5.5 Done in [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) | Product | After B1 |

See [`runbooks/legal-publish.md`](./runbooks/legal-publish.md).

## Track C — Desktop production release

```bash
./scripts/release-desktop.sh          # full gate
./scripts/bump-version.sh 1.0.0     # sync version files
npm run build:mac
node scripts/verify-packaged-app.cjs
git tag v1.0.0 && git push origin v1.0.0
```

CI on `v*` tags: signed DMG/EXE, GitHub Release, optional exosites.ch upload.  
Details: [`PRODUCTION_RELEASE.md`](./PRODUCTION_RELEASE.md).

## Track D — Mobile internal beta

```bash
npm run mobile:quality
git tag mobile-v0.2.0 && git push origin mobile-v0.2.0
```

Configure GitHub secrets per [`MOBILE_CI_SECRETS.md`](./MOBILE_CI_SECRETS.md).  
TestFlight / Play internal: [`MOBILE_RELEASE.md`](./MOBILE_RELEASE.md), [`MOBILE_BETA_PROGRAM.md`](./MOBILE_BETA_PROGRAM.md).

**Exit:** 10+ testers complete pairing + sync smoke.

## Track E — Public stores

After B + D + stable A:

- Submit App Store + Play production builds
- Pricing: Pro includes multi-device sync ([`gtm/go-sync-checklist.md`](./gtm/go-sync-checklist.md))
- [`STORE_LAUNCH.md`](./STORE_LAUNCH.md)

**Deferred v1.1:** push notifications, Capture PTT, OpenTelemetry (ADR-008).

## Weekly checkpoint

Desktop push → mobile pull on two physical devices against production `api.exosites.ch`.

## npm scripts reference

| Script | Purpose |
|--------|---------|
| `npm run deploy:cloud-api` | Rsync cloud-node + migrations 002–004 |
| `npm run verify:go-sync` | Relay HTTP smoke |
| `npm run verify:legal-urls` | Privacy/Terms URLs reachable |
| `npm run verify:ship` | All engineering gates (cloud optional with `--skip-cloud`) |
| `npm run release:cloud-api` | Deploy + verify relay |
| `npm run release:desktop` | Desktop pre-tag gate |
| `npm run release:mobile` | Mobile pre-tag gate |
| `npm run restart:cloud-api` | Restart Node after panel deploy |
