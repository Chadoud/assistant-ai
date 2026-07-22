# Mobile (incubating)

The Flutter mobile app is **not on `main`**. It lives on the long-lived branch:

```text
incubating/mobile
```

Checkout:

```bash
git fetch origin
git checkout incubating/mobile
```

## What stays on `main`

- GO SYNC cloud relay (`cloud-node` `/v1/sync/*`)
- Desktop QR pairing UI (Settings → Pair mobile device)
- Sync crypto under `sync/`
- Cloud auth including `/auth/mobile/start/:provider` (server contract for the incubating client)

## What lives only on `incubating/mobile`

- `mobile/` Flutter app
- Mobile npm scripts (`mobile:*`, `release:mobile`)
- `.github/workflows/mobile.yml`, `.fvm/`, mobile release scripts
- `docs/MOBILE_*.md` release/privacy/CI docs

## Syncing `main` into incubating

After mobile was removed from `main`, a naive merge will delete the app on the incubating branch. Follow the playbook in `mobile/README.md` on that branch (restore `mobile/` and mobile tooling after merge, then `npm run mobile:quality`).

## Releases

- Desktop: `v*` tags from `main` via `npm run release:desktop`
- Mobile: `mobile-v*` tags **only** from `incubating/mobile` via `npm run release:mobile`

## Merge back to `main`

Only when the incubating app is functional (quality green, pairing E2E, store beta path, PM/security sign-off). Restore the mobile tree, scripts, workflow, and quality-gate hooks in one PR.
