# Public store launch checklist

Use after **Track D** (internal beta) is clean and **Track B** (legal URLs) is live.

## Preconditions

- [ ] `npm run verify:go-sync` passes against production
- [x] `npm run verify:legal-urls` passes (pages live on exosites.ch)
- [ ] Counsel sign-off on exosites-agency app privacy + terms (PR-1.5.5)
- [ ] PR-1.5.5 marked Done in [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md)
- [ ] Desktop `v*` shipped or simultaneous launch planned
- [ ] 10+ beta testers: pairing + sync without P0 bugs ([`MOBILE_BETA_PROGRAM.md`](./MOBILE_BETA_PROGRAM.md))

## App Store Connect (iOS)

- [ ] App ID `com.exosites.exosites_mobile` + distribution profile in CI
- [ ] Privacy Nutrition Labels match [`MOBILE_STORE_PRIVACY.md`](./MOBILE_STORE_PRIVACY.md)
- [ ] Policy URLs: `https://exosites.ch/eng/app-privacy` and `/eng/app-terms`
- [ ] Screenshots per matrix in MOBILE_STORE_PRIVACY
- [ ] Export compliance questionnaire (standard encryption)
- [ ] Submit build from TestFlight promotion or fresh `mobile-v*` tag

## Google Play Console (Android)

- [ ] Data Safety form aligned with MOBILE_STORE_PRIVACY table
- [ ] Upload keystore backed up offline (not in repo)
- [ ] Internal → closed → production rollout staged
- [ ] `RECORD_AUDIO` justified (Capture v1.1) or disabled in release notes

## Desktop (direct download)

- [ ] Tag `v*` → GitHub prerelease + [`publish-staging`](../.github/workflows/build.yml) (staging feed only)
- [ ] Smoke staging feed, then promote to production (Phase 2) — see [desktop-update-pipeline-checklist.md](./runbooks/desktop-update-pipeline-checklist.md)
- [ ] Production `latest.json` on exosites.ch matches version after promote
- [ ] Packaged smoke per [`PRODUCTION_RELEASE.md`](./PRODUCTION_RELEASE.md) §6

## GTM

- [ ] Pricing page: Pro includes GO SYNC ([`gtm/go-sync-checklist.md`](./gtm/go-sync-checklist.md))
- [ ] Support email in store listings (`studio@exosites.com`)
- [ ] Release notes from [`RELEASE_NOTES_TEMPLATE.md`](./RELEASE_NOTES_TEMPLATE.md)

## Rollback

| Surface | Action |
|---------|--------|
| App Store / Play | Halt rollout; previous build remains installable |
| Relay | Do not drop `sync_blobs` without backup; disable routes only if emergency |
| Desktop updates | Revert `latest.json` on exosites.ch |

## Post-launch (week 1)

- [ ] Monitor Sentry + cloud `/metrics`
- [ ] Sync error rate < 1% of active Pro accounts
- [ ] Incident runbook: [`runbooks/incident-response.md`](./runbooks/incident-response.md)
