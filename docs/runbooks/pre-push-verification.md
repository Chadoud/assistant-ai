# Pre-push verification (local gates)

Local hooks catch **CI quality failures** and **unsigned Mac packaging breaks** before a `v*` / `mobile-v*` tag burns Actions minutes.

CI remains the ship authority for signed/notarized installers. The local stamp under `.git/exo-release-gate` is a **DX process gate**, not cryptographic attestation.

## Tiers

| When | What |
|------|------|
| Every commit | Husky `pre-commit` → `lint-staged` |
| Every `git push` | Husky `pre-push` → `bash scripts/verify-local.sh --quick` |
| Before `v*` / `mobile-v*` tag push | Fresh stamp from `npm run release:desktop` / `release:mobile` |

Break-glass only: `HUSKY_SKIP_VERIFY=1 git push` (prints a loud warning). Do not use for normal releases.

## Everyday PR work

```bash
git commit   # lint-staged
git push     # path-aware verify-local --quick
```

Manual:

```bash
npm run verify:local          # same as --quick
npm run verify:local:ci-parity  # + unused:strict + Playwright e2e smoke
```

## Desktop staging release (happy path)

1. Bump + CHANGELOG + commit (so HEAD version matches the tag you will create):

   ```bash
   ./scripts/bump-version.sh X.Y.Z
   # edit CHANGELOG.md
   npm run verify:release-version -- --version X.Y.Z
   git add … && git commit -m "…"
   ```

2. Full release gate (quality + **unsigned** native Mac package smoke):

   ```bash
   npm run release:desktop
   # or: npm run verify:pre-tag:desktop
   # optional: --skip-cloud if live API unreachable
   ```

   This runs `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac`, then `verify:packaged-app` and `verify-mac-backend-health` on the native backend slice, then writes `.git/exo-release-gate`.

3. Tag and push (pre-push checks stamp: kind, version, HEAD SHA, expiry, packaging=ok):

   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

4. Watch **Build Installers**; install the **staging** DMG for live QA (voice, Gmail, calendar).

5. Promote only after smoke: [desktop-update-promote.md](./desktop-update-promote.md).

**Order matters:** if you bump *after* `release:desktop`, re-run the gate so the stamp matches the new HEAD/version.

`RELEASE_SKIP_PACKAGING=1` skips Mac packaging but **does not write a stamp** — tag push stays blocked.

Optional closer-to-CI on Apple Silicon: `EXO_MAC_UNIVERSAL=1 npm run build:mac`.

## Mobile release

```bash
./scripts/bump-mobile-version.sh X.Y.Z [build]
git add mobile/pubspec.yaml && git commit -m "…"
npm run release:mobile
git tag mobile-vX.Y.Z && git push origin mobile-vX.Y.Z
```

## Coverage matrix

| Failure class | `verify-local --quick` | `release:desktop` | Still CI-only |
|---|---|---|---|
| Lint / FE unit / locale / tsc+Vite | Path-aware | Full `quality` | — |
| Backend pytest + import smokes | Path-aware | Yes | Cov thresholds |
| Electron IPC / d.ts / secret audits | Path-aware | Yes | — |
| Playwright e2e | `--ci-parity` only | Yes (in `quality`) | — |
| PyInstaller + electron-builder (unsigned) | — | **Required** | Codesign / notarize |
| `verify:packaged-app` + backend `/health` | — | **Required** | Universal dual-arch |
| Windows ISS | — | — | Yes |
| Live voice / OAuth / calendar | Unit only | Unit only | Staging DMG QA |

## Residual risk

- Local unsigned ≠ signed/notarized production installer
- Python version drift (CI may pin differently than your laptop)
- Stamp is forgeable on the local filesystem — CI still builds and signs
- Live session crashes need staging QA after the tag build

## Agent rule

Never `git push` a `v*` or `mobile-v*` tag without a green `npm run release:desktop` / `release:mobile` in the same session (stamp present and matching HEAD).
