# Signing secrets inventory (assistant-ai)

**Date:** 2026-07-15 (updated — M1c feed signing)  
**Repo:** `Chadoud/assistant-ai`

## Present

| Secret | Notes |
|--------|--------|
| `EXOSITES_DEPLOY_SSH_*` | Infomaniak deploy (host/user/password still present as fallback) |
| `EXOSITES_DEPLOY_SSH_PRIVATE_KEY` | Ed25519 PEM for downloads rsync (M1c.3) — local `~/.ssh/exosites_downloads_deploy` |
| `EXOSITES_DOWNLOADS_PATH` | `./sites/exosites.ch/downloads/exo-assistant` |
| `GMAIL_OAUTH_CLIENT_JSON_B64` | Bundled OAuth client |
| `MAC_CSC_LINK` | Developer ID `.p12` (base64) — exported from local Keychain 2026-07-15 |
| `MAC_CSC_KEY_PASSWORD` | PKCS12 password for above |
| `MAC_SIGN_IDENTITY` | `Developer ID Application: Chady Kassab (D6PLH24366)` |
| `APPLE_ID` | `chadykassab@yahoo.fr` (from Mac iCloud account) |
| `APPLE_TEAM_ID` | `D6PLH24366` |
| `APPLE_APP_SPECIFIC_PASSWORD` | Notarization (set for 1.1.47) |
| `UPDATE_FEED_PRIVATE_KEY_HEX` | Ed25519 seed for `latest.json` (M1c) — public key in `electron/updateFeed/embeddedPublicKey.js` |

## Still missing / optional

| Secret | Action |
|--------|--------|
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | Windows Authenticode (M1b — not wired in CI yet) |

Password deploy (`EXOSITES_DEPLOY_SSH_PASSWORD`) can stay until you confirm a tagged `publish-website` run used key auth; then remove it from GitHub and Infomaniak if desired.

## Note

GitHub cannot export secret *values* from `ai-assistant` / `ai-file-sorter`. Mac secrets on `assistant-ai` were re-created from the local Keychain Developer ID identity, not copied from GitHub.

Feed signing keygen: [`tools/update-feed-keygen/README.md`](../tools/update-feed-keygen/README.md).
