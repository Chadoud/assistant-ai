# Mobile CI secrets (GitHub Actions)

Configure these in **Settings → Secrets and variables → Actions** before tagging `mobile-v*`.

## Android (required for signed AAB)

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_B64` | Base64 of upload keystore `.jks` |
| `ANDROID_KEY_ALIAS` | Key alias (e.g. `exo-upload`) |
| `ANDROID_STORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_PASSWORD` | Key password |

Local setup: copy [`key.properties.example`](../mobile/key.properties.example) → `mobile/android/key.properties` and place keystore at `mobile/android/keystore/exo-upload.jks` (gitignored).

## iOS (required for signed IPA / TestFlight)

| Secret | Description |
|--------|-------------|
| `IOS_DIST_CERT_B64` | Base64 of `.p12` distribution certificate |
| `IOS_DIST_CERT_PASSWORD` | `.p12` export password |
| `IOS_PROVISION_PROFILE_B64` | Base64 of App Store provisioning profile |
| `IOS_KEYCHAIN_PASSWORD` | Ephemeral keychain password (any strong random string) |
| `APPLE_TEAM_ID` | 10-character team ID for `ExportOptions.plist` |

App ID: `com.exosites.exosites_mobile`.

## Fastlane upload (optional — local or separate workflow)

| Env var | Purpose |
|---------|---------|
| `FASTLANE_USER` | Apple ID for App Store Connect |
| `APP_STORE_CONNECT_API_KEY_*` | API key JSON path or key id + issuer + key file |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play service account for internal track |

## Behavior without secrets

- **Android:** CI builds unsigned AAB with debug signing (artifact for smoke only).
- **iOS:** CI builds `--no-codesign` Runner.app (same as before).

When all platform secrets are set, CI produces signed AAB + IPA artifacts on `mobile-v*` tags.

## Verify after configuring

```bash
npm run mobile:quality
git tag mobile-v0.2.0 && git push origin mobile-v0.2.0
```

See [`MOBILE_RELEASE.md`](./MOBILE_RELEASE.md) and [`SHIP_PROGRAM.md`](./SHIP_PROGRAM.md).
