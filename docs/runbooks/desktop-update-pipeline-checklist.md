# Desktop update pipeline — completion checklist

Use this to finish **build → validate → stage → smoke → promote → rollback** end-to-end.

**Legend:** `[ ]` todo · `[x]` done · mark owner/date in the notes column if useful.

**Related:** [DISTRIBUTION.md](../DISTRIBUTION.md) · [QUALITY_GATES.md](../QUALITY_GATES.md) · [PRODUCTION_RELEASE.md](../PRODUCTION_RELEASE.md)

---

## Status snapshot

| Phase | Name | Status |
|-------|------|--------|
| 0 | Version validity contract | [x] (code landed — merge + verify on next tag) |
| 1 | Staging-only publish (stop prod on tag) | [x] (code landed — ops dir/secret already done) |
| 2 | Promote + LKG + GitHub Environment | [x] code — **you**: LKG dir + Environment reviewers |
| 3 | Hardening + client channel | [~] SHA256SUMS on promote done; beta UI deferred |
| 4 | Scale (later) | [ ] deferred |

**Your remaining steps:** [desktop-update-YOU-ONLY.md](./desktop-update-YOU-ONLY.md)

---

## Phase 0 — Version validity contract

**Exit:** A tag with mismatched versions cannot publish staging or prod.

### Code

- [x] Add `scripts/validate-release-version.mjs`
- [x] Assert tag/`package.json`/`appVersion`/`installer.iss`/CHANGELOG
- [x] `npm run verify:release-version`
- [x] Unit tests (`scripts/validate-release-version.test.mjs`)
- [ ] Optionally extend `scripts/bump-version.sh` to warn if CHANGELOG section missing

### CI

- [x] Job `validate-release-version` on `v*` before publish
- [x] `publish-release` / `publish-staging` need the validator

### Docs

- [x] QUALITY_GATES / DISTRIBUTION / PRODUCTION_RELEASE updated
- [x] `MyAppVersion` → `AppVersion`; SSH password removed from secrets table

**Phase 0 done when:** local `npm run verify:release-version` passes (verified); next `v*` tag exercises CI.

---

## Phase 1 — Staging-only publish (critical)

**Exit:** `v*` updates **staging** feed only. Production `latest.json` is untouched by tags.

### Ops (Infomaniak / hosting)

- [x] Create `downloads/exo-assistant-staging/`
- [x] Public HTTPS confirmed (`.keep` → ok)
- [x] GitHub secret `EXOSITES_DOWNLOADS_STAGING_PATH`

### CI

- [x] `publish-staging` with staging URLs + sign + rsync staging path
- [x] Removed prod rsync from tag path (`publish-website` gone)
- [x] Fail closed on missing staging SSH/path secrets
- [x] `publish-release` kept as candidate

### Local scripts

- [ ] Update `scripts/publish-downloads-local.sh` for staging dest / `FEED_BASE`
- [ ] Update `scripts/publish-from-ci-artifacts.sh` similarly
- [x] `cloud-node/.env.deploy.example` staging path vars

### Docs

- [x] DISTRIBUTION / PRODUCTION_RELEASE / signing inventory / STORE_LAUNCH

### Manual verify (after merge + next tag)

- [ ] Tag → staging `latest.json` updates
- [ ] Production `latest.json` **unchanged**
- [ ] Staging feed has `sig`; version matches tag

**Phase 1 code done.** Full exit after first post-merge `v*` tag smoke.

---

## Phase 2 — Promote + LKG + Environment

**Exit:** Only approved promote changes production feed; LKG exists for rollback.

### GitHub

- [x] Workflow uses Environment `desktop-updates-production`
- [x] Environment `desktop-updates-production` + reviewer Chadoud

### Ops

- [x] LKG dir `exo-assistant-lkg` on Infomaniak
- [ ] Optional secret `EXOSITES_DOWNLOADS_LKG_PATH`

### Workflow / scripts

- [x] `.github/workflows/promote-desktop-feed.yml` (promote + rollback)
- [x] `scripts/promote-desktop-feed.sh` + `ensure-downloads-dirs-remote.sh`
- [x] Channel constants `scripts/lib/desktop-feed-channels.cjs`
- [x] SHA256SUMS on promote; mark Release non-prerelease
- [x] Local publish defaults to **staging** (`CHANNEL=staging`)

### Runbook

- [x] `desktop-update-promote.md` + `desktop-update-YOU-ONLY.md`
- [x] QUALITY_GATES L3.5 / L3.6

### Manual verify (first release after merge)

- [ ] Promote → prod updates; LKG snapshotted; rollback works; Environment gate works

**Phase 2 code done.** Ops + first E2E test = you.

---

## Phase 3 — Hardening + optional client channel

**Exit:** Stronger automation; optional beta dogfood without custom env hacks.

### Hardening

- [ ] Post-artifact check: `latest-mac.yml` `version` == tag
- [ ] Publish SHA256 manifest (Release body or `SHA256SUMS` in feed dir)
- [ ] Tag workflow comment/summary with staging URLs for QA
- [ ] Optional notify (Slack/email) on promote / rollback
- [ ] Align `SECURITY_HARDENING_PLAN` C5 (LKG) as done

### Client channel (optional but recommended for dogfood)

- [ ] Channel resolver in `electron/autoUpdater.js` (`stable` | `beta` + env override wins)
- [ ] Persist preference (device prefs)
- [ ] Settings UI: “Beta updates” + i18n (en/de/fr/it)
- [ ] IPC / `electron.d.ts` / preload / manifest if needed
- [ ] Unit tests for feed URL resolution
- [ ] Docs: how beta clients point at staging or beta channel

### Manual verify

- [ ] Stable build never hits staging unless misconfigured
- [ ] Beta/test build can update from staging/beta feed
- [ ] Signed `latest.json` still required

**Phase 3 done when:** promote path is boring; dogfood doesn’t risk all users.

---

## Phase 4 — Scale (defer until needed)

- [ ] Central `channels` config module (id → public URL → remote path secret)
- [ ] Dedicated `…/exo-assistant-beta/` if staging must stay “last candidate only”
- [ ] Canary / % rollout (only if product needs it — feed is all-or-nothing today)
- [ ] Windows in-app updater when Authenticode lands (reuse same channels/promote)

---

## Day-2 operating checklist (every release)

Copy per release:

### Prepare

- [ ] `./scripts/bump-version.sh X.Y.Z`
- [ ] Add `## [X.Y.Z]` to `CHANGELOG.md`
- [ ] `npm run verify:release-version -- --version X.Y.Z`
- [ ] Legal / cloud / `npm run verify:production` as needed ([PRODUCTION_RELEASE.md](../PRODUCTION_RELEASE.md))

### Stage

- [ ] Tag `vX.Y.Z` and push
- [ ] CI green: build + validate + staging publish + GitHub candidate
- [ ] Confirm staging `latest.json` version == `X.Y.Z`

### Smoke (before promote)

- [ ] Install or update from **staging** feed on a real Mac
- [ ] Gatekeeper / notarization OK (signed build)
- [ ] Sign-in works; account vault OK
- [ ] Core smoke (chat / sort / settings as relevant)
- [ ] In-app update UI shows version; Mac apply works if testing updater
- [ ] Notes match CHANGELOG

### Promote

- [ ] Actions → **Promote desktop feed** → version `X.Y.Z`
- [ ] Approve Environment `desktop-updates-production`
- [ ] Confirm prod `latest.json` == `X.Y.Z`
- [ ] Spot-check one stable client sees update (or download page)

### If bad

- [ ] Run rollback → restore LKG
- [ ] Confirm prod version reverted
- [ ] File incident note ([incident-response.md](./incident-response.md))

---

## Cross-cutting (do anytime; don’t ship Phase 2 without these)

- [ ] Team agrees: **tag = candidate**, **promote = users**
- [ ] At least one person besides author can approve Environment
- [ ] Staging URL bookmarked for QA
- [ ] Prod URL bookmarked for verify-after-promote
- [ ] Secrets inventory updated and not committed

---

## Progress log

| Date | Phase | What landed | Who |
|------|-------|-------------|-----|
| | | | |
