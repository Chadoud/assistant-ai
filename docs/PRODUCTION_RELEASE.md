# Production release checklist (Exo DMG + EXE)

Use this before tagging `v*` and shipping installers to users.

**CI note:** Pull requests run quality gates only (path-filtered). **Full Windows/Mac installers build on `v*` tags** (or manual `workflow_dispatch`), not on every PR. Packaging-path PRs may run a thin Mac `package-smoke-mac` + `verify:packaged-app`. See [`QUALITY_GATES.md`](./QUALITY_GATES.md).

**Readiness program:** For tests, observability, and PII/compliance tasks beyond installer smoke, see [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md). Full ship checklist: [`SHIP_PROGRAM.md`](./SHIP_PROGRAM.md).

## 0. Legal URLs

**Published** at exosites.ch (source: **exosites-agency** repo). Engineering is wired; **counsel sign-off** closes PR-1.5.5.

1. Counsel reviews `exosites-agency/src/translations/pages/appPrivacy.ts` and `appTerms.ts` (see [`runbooks/legal-publish.md`](./runbooks/legal-publish.md))
2. Deploy agency site if copy changes
3. `npm run verify:legal-urls` — must pass before store submission
4. Bump `LEGAL_TERMS_BUNDLE_VERSION` only if published text changed materially

URLs (already in release CI): `https://exosites.ch/eng/app-privacy` · `https://exosites.ch/eng/app-terms`

## 1. Cloud API (account gate)

```bash
VERIFY_AFTER_DEPLOY=1 ./scripts/deploy-cloud-api.sh          # after editing cloud-node/.env + .env.deploy
# Restart Node app in Infomaniak Manager → api.exosites.ch
./scripts/verify-cloud-auth-api.sh   # auth + GO SYNC relay (or npm run verify:production locally)
npm run verify:legal-urls            # Privacy/Terms URLs (store blocker)
```

See [`CLOUD_AUTH_RELEASE.md`](CLOUD_AUTH_RELEASE.md) for Google OAuth and env vars.

## 2. Local verification (before packaging)

```bash
npm run verify:production
```

Runs IPC manifest, `registerHandlers()` guard, and production cloud auth smoke test.

## 3. Bundle resources

```bash
bash scripts/prepare-release-resources.sh
```

Creates `electron/resources/integration-config.json` if missing.

**Gmail “Connect” in packaged builds** requires `electron/resources/gmail_oauth_client.json` (gitignored). Options:

- From `backend/.env` Desktop credentials: `npm run sync:gmail-oauth-release` (writes gitignored `.env.release` + JSON)
- Place the JSON file manually before `npm run build:mac` / `package:win`
- CI: set repository secret `GMAIL_OAUTH_CLIENT_JSON_B64` (base64 of the Desktop OAuth JSON — same value as in `.env.release`)

## 4. Build installers

| Platform | Command | Output |
|----------|---------|--------|
| macOS | `npm run build:mac` | `dist-installer/Exo.dmg`, `Exo-*.zip`, `latest-mac.yml` |
| Windows | Build backend + `npm run package:win` + Inno Setup | `dist-installer/Exo Setup.exe` |

Post-build (macOS):

```bash
node scripts/verify-packaged-app.cjs
```

## 5. GitHub Actions secrets (signed + auto-update)

| Secret | Purpose |
|--------|---------|
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | Sign macOS app |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Notarize |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Sign Windows (when wired in CI) |
| `EXOSITES_DEPLOY_SSH_USER`, `EXOSITES_DEPLOY_SSH_HOST`, `EXOSITES_DEPLOY_SSH_PRIVATE_KEY` | **exosites.ch Web** SSH (same as `exosites-agency`) — not `api.exosites.ch` |
| `EXOSITES_DOWNLOADS_STAGING_PATH` | `./sites/exosites.ch/downloads/exo-assistant-staging` (tag CI uploads here) |
| `EXOSITES_DOWNLOADS_PATH` | `./sites/exosites.ch/downloads/exo-assistant` (production — promote only; not written by tag CI) |
| `VITE_SENTRY_DSN` | Crash reporting in renderer |
| `GMAIL_OAUTH_CLIENT_JSON_B64` | Optional bundled Gmail OAuth client |

Tag push `v*` → CI builds, `verify:release-version`, GitHub prerelease, **staging** feed upload.
Production: Actions → **Promote desktop feed** (see [desktop-update-promote.md](./runbooks/desktop-update-promote.md)).

## 6. Manual smoke test (packaged app)

1. Install from `/Applications/Exo.app` (not mounted DMG).
2. Account screen: email form + **Continue with Google** (no “server not available” banner).
3. Google sign-in opens **Safari/Chrome**, returns via `exo://`.
4. Welcome wizard after sign-in.
5. Run a small sort job (backend on `127.0.0.1:7799`).

## 7. Version bump (same release)

Sync before tag:

- `package.json` → `version`
- `frontend/package.json` → `version`
- `frontend/src/appVersion.ts`
- `installer.iss` → `#define AppVersion`
- `CHANGELOG.md` → `## [x.y.z]`
- Then: `npm run verify:release-version -- --version x.y.z`

## Known unsigned-build limits

Without code signing, macOS Gatekeeper and Windows SmartScreen show warnings. See [`DISTRIBUTION.md`](DISTRIBUTION.md) for certificate setup.
