# Update-feed signing (operators)

Ed25519 signatures for `latest.json` on `https://exosites.ch/downloads/exo-assistant/`.

Dedicated key — **not** the offline license key in `tools/license-keygen/`.

## Generate a keypair

```bash
node tools/update-feed-keygen/generate-keypair.cjs
```

1. Put **PUBLIC** hex in [`electron/updateFeed/embeddedPublicKey.js`](../../electron/updateFeed/embeddedPublicKey.js).
2. Store **PRIVATE** as GitHub Actions secret `UPDATE_FEED_PRIVATE_KEY_HEX` (and optionally local `UPDATE_FEED_PRIVATE_KEY_FILE`).
3. Ship a new app build after rotating keys — old clients will reject feeds signed with the new private key until they update.

## Sign `latest.json`

```bash
UPDATE_FEED_PRIVATE_KEY_HEX=<64-hex> \
  node tools/update-feed-keygen/sign-latest.cjs path/to/latest.json
```

Canonical payload = sorted JSON keys excluding `sig`. Field `sig` is base64url of the 64-byte signature.

## CI

Tag `publish-website` signs with `UPDATE_FEED_PRIVATE_KEY_HEX` and fails closed if the secret is missing.
