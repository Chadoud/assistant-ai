# Distribution: signing and updates

## Current state

- Installers are produced in CI ([`.github/workflows/build.yml`](../.github/workflows/build.yml)):
  - **Windows** — Inno Setup `.exe` (manual packager + Inno; **Authenticode not wired yet**)
  - **macOS** — universal `.dmg` + `.zip` (Intel + Apple Silicon) via electron-builder; **Developer ID + notarized** when Apple secrets are present (from **1.1.47+**)
- Tag pushes (`v*`) attach installers to a GitHub **release** and rsync the update
  feed to **`https://exosites.ch/downloads/exo-assistant/`** (`latest.json`,
  `latest-mac.yml`, DMG/EXE).
- **Auto-updates** (`electron/autoUpdater.js`):
  - **macOS (packaged):** electron-updater **generic** provider against
    `EXOSITES_UPDATE_FEED_URL` (default `https://exosites.ch/downloads/exo-assistant`),
    using `latest-mac.yml` + zip sha512. Discovery/notes use **Ed25519-signed**
    `latest.json` (packaged clients reject missing/invalid `sig`). Self-update
    requires the running app to be **Developer ID–signed**.
  - **Windows:** no electron-updater self-update — opens the download page /
    `latest.json` URL in the browser.
  - Dev builds and unreachable feeds no-op safely.
- **Windows builds remain unsigned** (SmartScreen may warn). Mac public builds
  from 1.1.47+ are notarized. End users: [INSTALL.md](INSTALL.md). Certificate
  status: [runbooks/signing-secrets-inventory.md](runbooks/signing-secrets-inventory.md).

End-user Mac guide: [MACOS.md](MACOS.md).  
Hardening roadmap: [SECURITY_HARDENING_PLAN.md](SECURITY_HARDENING_PLAN.md).

## One-command Mac build (local)

On a Mac, from the repo root:

```bash
npm run build:mac
```

Produces `dist-installer/Exo.dmg` (and `Exo-*.zip` + `latest-mac.yml` when using `npm run build:mac`).

**Full release checklist:** [`PRODUCTION_RELEASE.md`](PRODUCTION_RELEASE.md)

## Code signing (owner checklist for public release)

CI supports Mac signing **conditionally** when secrets exist; otherwise builds stay
unsigned. Windows Authenticode secrets are **documented only** — SignTool is **not**
wired into `scripts/package-app.js` / Inno / `build.yml` yet (M1b).

### Windows (Authenticode) — not CI-ready

1. **Purchase a code-signing certificate** (OV ~$200–400/yr, or EV for faster SmartScreen).
2. Export base64 `.pfx`.
3. Add GitHub Actions secrets when ready to wire CI:
   - `WIN_CSC_LINK` — base64 `.pfx`
   - `WIN_CSC_KEY_PASSWORD` — password
4. **Then** implement SignTool on packed `Exo.exe` + `Exo Setup.exe` (see hardening plan M1b).
   Until that lands, adding secrets alone does **nothing**.

### macOS (Developer ID + notarization)

1. **Enroll in the Apple Developer Program** ($99/yr).
2. Create a **Developer ID Application** certificate; export base64 `.p12`.
3. Create an **app-specific password** (appleid.apple.com).
4. Add GitHub Actions secrets:

| Secret | Purpose |
|--------|---------|
| `MAC_CSC_LINK` | Base64 `.p12` |
| `MAC_CSC_KEY_PASSWORD` | Certificate password |
| `MAC_SIGN_IDENTITY` | Full identity string (also signs PyInstaller backend) |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID |

5. Re-run a `v*` tag — `afterSign` notarization (`scripts/notarize.cjs`) and
   hardened-runtime entitlements (`electron/entitlements.mac.plist`) are configured.
   Local signed builds: set `MAC_SIGN_IDENTITY` so `scripts/build-mac-release.sh`
   codesigns the backend child.

Until Windows certificates exist, keep **unsigned-build warnings** for Windows in the
README, [INSTALL.md](INSTALL.md), and release notes.

### Update feed (`latest.json`) — Ed25519

| Secret / env | Purpose |
|--------------|---------|
| `UPDATE_FEED_PRIVATE_KEY_HEX` | CI/local: sign `latest.json` (see [`tools/update-feed-keygen/`](../tools/update-feed-keygen/)) |

Public key is embedded in [`electron/updateFeed/embeddedPublicKey.js`](../electron/updateFeed/embeddedPublicKey.js).
Tag `publish-website` **fails** if the private key secret is missing.

## Auto-update operational notes

- **Feed host:** `https://exosites.ch/downloads/exo-assistant/` (not GitHub Releases).
  `package.json` `build.publish` / GitHub provider is unused by the runtime updater
  (`--publish never` in CI).
- Legacy path `/downloads/ai-file-manager/` **301-redirects** to `exo-assistant`.
- Compromise of Infomaniak deploy credentials or the downloads directory can
  replace feed files — mitigated by Mac notarization (M1a), signed `latest.json`
  (M1c.1), Developer ID gate on self-update (M1c.2), and SSH key deploy (M1c.3).
- Prefer GitHub secret `EXOSITES_DEPLOY_SSH_PRIVATE_KEY` (PEM); password/`sshpass`
  remains a temporary fallback until the key is installed.
- Unsigned macOS builds cannot auto-update (self-update requires Developer ID).
- Windows does not self-update via electron-updater today.

Keep [`package.json`](../package.json), [`frontend/package.json`](../frontend/package.json),
`frontend/src/appVersion.ts`, and `installer.iss` versions aligned (see
[BETA_RELEASE.md](BETA_RELEASE.md)).
