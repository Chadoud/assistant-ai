# GTM checklist — GO SYNC edition


> **Mobile status:** Flutter app is on `incubating/mobile` (not `main`). See [`MOBILE.md`](../MOBILE.md).

## Your actions (not automated)

- [ ] Apple Developer Program + Windows Authenticode cert
- [ ] Deploy sync relay (`docs/runbooks/relay-deploy.md`) — `npm run deploy:cloud-api` + `npm run verify:go-sync`
- [ ] Apple/Google store accounts + Firebase push (mobile)
- [ ] Privacy policy / DPA updated for E2E sync + mobile capture
- [ ] Pricing page: Pro includes multi-device sync
- [ ] Beta program: 10–20 users on encrypted sync before public mobile

## Pro tier (engineering done)

- `canUseSync` in entitlement gate
- Settings → Sync UI with upgrade path
- Cloud auth + sync relay API
