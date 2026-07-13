# GO SYNC E2E smoke test (manual)

Run after `npm run verify:go-sync` passes against production.

**Time:** ~30 minutes · **Devices:** 1 Mac (desktop) + 1 iPhone or Android phone

## Prerequisites

- [ ] Production relay deployed (`VERIFY_AFTER_DEPLOY=1 ./scripts/deploy-cloud-api.sh`)
- [ ] `npm run verify:go-sync` green
- [ ] Pro/trial account with `canUseSync: true`
- [ ] Desktop build with QR pairing (`npm run dev` or packaged app)
- [ ] Mobile: `npm run mobile:run:ios` or `mobile:run:android` with `env/production.json`

## Steps

| # | Actor | Action | Pass |
|---|-------|--------|------|
| 1 | Desktop | Sign in → Settings → Sync → enable GO SYNC | QR visible |
| 2 | Mobile | Settings → Sign in with Google (same account) | Signed in |
| 3 | Mobile | Settings → Pair with desktop → scan QR | “Paired” banner |
| 4 | Desktop | Create or sync a memory (assistant chat / memory feature) | Desktop shows data |
| 5 | Mobile | Today tab → **Sync now** (pull) | Memories appear on phone |
| 6 | Mobile | Memory tab → open an item | Content readable |
| 7 | Both | Sign out mobile → sign in again → Sync now | Data still syncs |

## Failure triage

| Symptom | Check |
|---------|--------|
| QR won't scan | Desktop `qrcode` dep installed; cloud URL matches mobile |
| Pair succeeds, empty Today | Desktop push ran; relay `blob_count` in `/v1/sync/status` |
| 401 on sync | Token expired — re-sign in on mobile |
| 404 on `/v1/sync/*` | Old cloud-node on server — redeploy + migration 004 |

## Sign-off

Record tester, date, app versions (desktop + mobile), and account email (internal only) in the release thread.
