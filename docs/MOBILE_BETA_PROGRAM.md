# Exo Mobile — store beta checklist (10–20 users before public listing)

Track progress in release threads; link TestFlight / Play internal builds.

- [ ] Internal testers invited (iOS TestFlight + Android Play internal)
- [ ] Desktop → mobile pairing verified on real devices (QR flow)
- [ ] Sync pull shows memories from desktop on 3+ tester accounts
- [ ] Sign-out clears pairing key + local cache (verify on a shared test device)
- [ ] Privacy policy links mobile E2E sync ([`MOBILE_STORE_PRIVACY.md`](MOBILE_STORE_PRIVACY.md)) — mobile Settings opens live URLs
- [ ] `npm run verify:go-sync` passes before beta invite (blocking on `mobile-v*` CI)
- [ ] `npm run mobile:quality` green (includes manifest guard)
- [ ] Crash-free sessions > 99% during beta week
- [ ] Capture communicated as **coming later** (no mic permission in beta builds)

See also [`gtm/go-sync-checklist.md`](gtm/go-sync-checklist.md) and [`MOBILE_SECURITY_REVIEW.md`](MOBILE_SECURITY_REVIEW.md).
