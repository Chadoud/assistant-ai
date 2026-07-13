# Exo Mobile (Flutter)

GO SYNC mobile client for **iOS** and **Android**. Requires **Flutter 3.24.5** (see [`.fvm/fvm_config.json`](../.fvm/fvm_config.json)).

## First-time setup

From repository root:

```bash
npm run mobile:setup
```

Generates `ios/` + `android/` on first run, patches permissions and OAuth deep links, then generates Exo icons/splash from `electron/assets/icon.png`.

**Flutter version:** CI pins **3.24.5** (`.fvm/fvm_config.json`). Local Homebrew Flutter works for dev; for release builds match CI via [FVM](https://fvm.app):

```bash
dart pub global activate fvm
fvm install 3.24.5
fvm use 3.24.5
```

## Run

```bash
npm run mobile:run:ios      # macOS + Xcode
npm run mobile:run:android  # Android SDK / emulator
```

## Quality gate

```bash
npm run mobile:quality   # analyze + test
```

CI: [`.github/workflows/mobile.yml`](../.github/workflows/mobile.yml) on every PR touching `mobile/`.

## Flavors

| Flavor | Dart defines |
|--------|----------------|
| staging | `--dart-define-from-file=env/staging.json` |
| production | `--dart-define-from-file=env/production.json` |

## GO SYNC flow

1. **Desktop:** Settings → Sync → enable GO SYNC → scan **Pair mobile device** QR.
2. **Mobile:** Settings → Sign in with Google → **Pair with desktop** (QR).
3. **Today → Sync now** pulls encrypted blobs into local SQLite.

## Release

See [`docs/MOBILE_RELEASE.md`](../docs/MOBILE_RELEASE.md) and [`docs/MOBILE_STORE_PRIVACY.md`](../docs/MOBILE_STORE_PRIVACY.md).

Tag `mobile-v*` to trigger optional CI build artifacts (AAB + iOS).
