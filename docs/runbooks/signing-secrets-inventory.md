# Signing secrets inventory (assistant-ai)

**Date:** 2026-07-15  
**Repo:** `Chadoud/assistant-ai`  
**Source:** `gh secret list` (names only)

## Present

| Secret | Notes |
|--------|--------|
| `EXOSITES_DEPLOY_SSH_HOST` | Infomaniak FTP/SSH host |
| `EXOSITES_DEPLOY_SSH_USER` | Deploy user |
| `EXOSITES_DEPLOY_SSH_PASSWORD` | Password auth (replace with key in M1c.3) |
| `EXOSITES_DOWNLOADS_PATH` | `./sites/exosites.ch/downloads/exo-assistant` |

## Absent (blocks signed releases)

| Secret | Needed for |
|--------|------------|
| `MAC_CSC_LINK` | Mac Developer ID `.p12` (base64) |
| `MAC_CSC_KEY_PASSWORD` | `.p12` password |
| `MAC_SIGN_IDENTITY` | Codesign backend + Electron (`Developer ID Application: …`) |
| `APPLE_ID` | Notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | Notarization |
| `APPLE_TEAM_ID` | Notarization |
| `WIN_CSC_LINK` | Windows Authenticode `.pfx` (base64) — **not wired in CI yet** |
| `WIN_CSC_KEY_PASSWORD` | `.pfx` password |

## Implication

Public `v*` builds remain **unsigned** until Mac secrets are populated (M1a) and Windows SignTool is wired (M1b). See [`docs/SECURITY_HARDENING_PLAN.md`](../SECURITY_HARDENING_PLAN.md).
