# Distribution: signing and updates

## Current state

- Installers are produced in CI ([`.github/workflows/build.yml`](../.github/workflows/build.yml)):
  - **Windows** — Inno Setup `.exe`
  - **macOS** — universal `.dmg` + `.zip` (Intel + Apple Silicon)
- Tag pushes (`v*`) attach both installers to a GitHub **pre-release**
  automatically, with notes taken from [`CHANGELOG.md`](../CHANGELOG.md).
- **Auto-updates are wired** (`electron/autoUpdater.js`, `electron-updater`):
  packaged builds check the GitHub Releases feed configured in `package.json`
  `build.publish`, download in the background, and install on quit. CI uploads
  the updater metadata (`latest.yml` / `latest-mac.yml`, `.blockmap`, mac `.zip`)
  alongside the installers. Dev builds and builds without a reachable feed
  no-op safely.
- **Builds are currently unsigned** — SmartScreen (Windows) and Gatekeeper
  (macOS) warn on first launch. End users get per-OS steps in
  [INSTALL.md](INSTALL.md); certificate acquisition is an owner action item
  (see below).

End-user Mac guide: [MACOS.md](MACOS.md).

## One-command Mac build (local)

On a Mac, from the repo root:

```bash
npm run build:mac
```

Produces `dist-installer/Exo.dmg` (and `Exo-*.zip` + `latest-mac.yml` when using `npm run build:mac`).

**Full release checklist:** [`PRODUCTION_RELEASE.md`](PRODUCTION_RELEASE.md)

## Code signing (owner checklist for public release)

CI already supports signing **conditionally** — when the secrets below are
absent, builds stay unsigned and everything else still works. To turn signing
on, the repository owner needs to:

### Windows (Authenticode)

1. **Purchase a code-signing certificate.** Options:
   - *OV certificate* (~$100–400/yr, e.g. Sectigo/Certum): SmartScreen warnings
     fade only after the certificate builds download reputation.
   - *EV certificate* (~$250–700/yr, hardware token or cloud HSM): immediate
     SmartScreen reputation — recommended for a public launch.
2. Export/obtain the certificate as a base64-encoded `.pfx`.
3. Add GitHub Actions secrets:
   - `WIN_CSC_LINK` — the base64 `.pfx`
   - `WIN_CSC_KEY_PASSWORD` — its password
4. Re-run the pipeline — the Windows job picks the secrets up automatically.

### macOS (Developer ID + notarization)

1. **Enroll in the Apple Developer Program** ($99/yr).
2. In the developer portal, create a **Developer ID Application** certificate
   and export it as a base64 `.p12`.
3. Create an **app-specific password** for your Apple ID (appleid.apple.com).
4. Add GitHub Actions secrets:

| Secret | Purpose |
|--------|---------|
| `MAC_CSC_LINK` | Base64 `.p12` |
| `MAC_CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID |

5. Re-run the pipeline — `afterSign` notarization (`scripts/notarize.cjs`) and
   hardened-runtime entitlements (`electron/entitlements.mac.plist`) are already
   configured. For local signed builds, also set `MAC_SIGN_IDENTITY` so
   `scripts/build-mac-release.sh` codesigns the PyInstaller backend child.

Until certificates exist, keep the **unsigned-build warnings** in the README,
[INSTALL.md](INSTALL.md), and the release notes template.

## Auto-update operational notes

- The feed is GitHub Releases (`package.json` → `build.publish`); **renaming the
  repo breaks the update feed** for existing installs — coordinate any rename
  with a coordinated `build.publish` change and a final release on the old name
  pointing users at the new one.
- Updates are served over HTTPS by GitHub; no separate update server exists.
- Unsigned macOS builds cannot auto-update (Squirrel.Mac requires a signed app);
  Windows unsigned updates work but re-trigger SmartScreen.

Keep [`package.json`](../package.json), [`frontend/package.json`](../frontend/package.json),
`frontend/src/appVersion.ts`, and `installer.iss` versions aligned (see the
release checklist in [BETA_RELEASE.md](BETA_RELEASE.md)).
