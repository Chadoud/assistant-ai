# Mobile security review notes (GO SYNC beta)

Threat model: stolen phone, malicious QR, XSS on unrelated sites is out of scope; focus on auth deep links, secure storage, and master-key handling.

## Reviewed controls

| Control | Status | Notes |
|---------|--------|-------|
| OAuth callback scheme `exosites://oauth` | OK | Committed in Info.plist + AndroidManifest; guarded by `scripts/verify-mobile-manifests.sh` |
| Tokens in Keychain/Keystore | OK | Via `FlutterSecureStorage` / `KeyValueStore` |
| Master key never sent to API | OK | Decrypt only on device; relay stores ciphertext |
| Sign-out wipe | OK | Clears access/refresh, master key, `sync_paired`, cursor, SQLite DB |
| QR master key | WARN (by design) | Treat QR like a password; desktop shows only when user starts pairing |
| Refresh on 401 | OK | Single-flight `/auth/refresh`; failed refresh clears session |
| Crash ingest | OK | Opt-in; truncated fields; no paths/prompts |

## Residual risks

- Pairing QR screenshot/leak grants decrypt capability until user re-pairs or rotates key on desktop.
- No certificate pinning (standard TLS) — document before adding.
- Capture / outbound push deferred — do not re-add mic permission until that feature ships.

## Pre-merge checklist (auth/sync PRs)

- [ ] Manifest guard still green
- [ ] New secrets never logged
- [ ] Wipe path covered by unit test
- [ ] Deep-link errors do not crash the isolate
