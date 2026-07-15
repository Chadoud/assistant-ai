# Signing secrets inventory (assistant-ai)

**Date:** 2026-07-15 (updated)  
**Repo:** `Chadoud/assistant-ai`

## Present

| Secret | Notes |
|--------|--------|
| `EXOSITES_DEPLOY_SSH_*` | Infomaniak deploy |
| `EXOSITES_DOWNLOADS_PATH` | `./sites/exosites.ch/downloads/exo-assistant` |
| `GMAIL_OAUTH_CLIENT_JSON_B64` | Bundled OAuth client |
| `MAC_CSC_LINK` | Developer ID `.p12` (base64) — exported from local Keychain 2026-07-15 |
| `MAC_CSC_KEY_PASSWORD` | PKCS12 password for above |
| `MAC_SIGN_IDENTITY` | `Developer ID Application: Chady Kassab (D6PLH24366)` |
| `APPLE_ID` | `chadykassab@yahoo.fr` (from Mac iCloud account) |
| `APPLE_TEAM_ID` | `D6PLH24366` |

## Still missing (blocks notarization)

| Secret | Action |
|--------|--------|
| `APPLE_APP_SPECIFIC_PASSWORD` | Create at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords → label e.g. `exo-notarize` → paste into `gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo Chadoud/assistant-ai` |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | Windows Authenticode (M1b — not wired in CI yet) |

## Note

GitHub cannot export secret *values* from `ai-assistant` / `ai-file-sorter`. Mac secrets on `assistant-ai` were re-created from the local Keychain Developer ID identity, not copied from GitHub.
