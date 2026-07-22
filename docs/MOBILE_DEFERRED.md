# Mobile deferred work (post-beta)

Scheduled after store beta feedback. Do not block beta on these.

## Capture + outbound sync

- [ ] Capture UI + `NSMicrophoneUsageDescription` / `RECORD_AUDIO` with honest purpose strings
- [ ] Wire `SyncEngine.pushLocalRecords` from Capture/notes
- [ ] Document LWW / conflict behavior vs desktop
- [ ] Tests for encrypt-push path
- [ ] Update [`MOBILE_STORE_PRIVACY.md`](MOBILE_STORE_PRIVACY.md) before shipping Capture

## Platform completeness

- [x] Apple Sign-In UI (`/auth/mobile/start/apple`) — shipped with email/password on setup
- [ ] `flutter_localizations` / ARB — start from `lib/sync/user_messages.dart`
- [ ] Offline indicators; background sync policy (if product wants it)
- [ ] Cert pinning decision vs threat model
- [ ] Performance budgets: cold start, sync of N blobs

## Product polish

- [ ] Memory filters / collections
- [ ] Deep link to a specific memory
- [ ] Accessibility audit (VoiceOver / TalkBack)
- [ ] Tablet layout polish beyond current breakpoints
