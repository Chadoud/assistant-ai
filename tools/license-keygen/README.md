# Offline license signing (operators)

The desktop app embeds **only** the Ed25519 **public** key (`electron/entitlement/embeddedPublicKey.js` and `backend/entitlement_constants.py`). This folder contains a **signing** helper for internal use.

## Generate a keypair (one-time)

From the repository root (uses app dependencies):

```bash
node -e "(async()=>{const ed=await import('@noble/ed25519');const sk=ed.utils.randomPrivateKey();const pk=await ed.getPublicKeyAsync(sk);console.log('PRIVATE (never commit):',Buffer.from(sk).toString('hex'));console.log('PUBLIC (embed in app):',Buffer.from(pk).toString('hex'));})();"
```

Store the private key in a **password manager** or offline file such as `private-key.hex` (listed in `.gitignore`). Update the public key in:

- `electron/entitlement/embeddedPublicKey.js` — `EMBEDDED_LICENSE_PUBLIC_KEY_HEX`
- `backend/entitlement_constants.py` — `EMBEDDED_LICENSE_PUBLIC_KEY_HEX`

Ship a new app build after rotating keys. Old licenses signed with the previous private key will fail verification unless you add multi-key support later.

## Machine fingerprint

The license binds to one device. The fingerprint is a 64-character hex SHA-256 string:

- **Desktop:** run from repo root  
  `node -e "console.log(require('./electron/entitlement/machineId').getMachineFingerprint())"`
- **Backend (same value on same machine):**  
  `python -c "from machine_fingerprint import machine_fingerprint; print(machine_fingerprint())"`  
  (run inside `backend/` with `EXOSITES_USER_DATA` set if you need env parity; fingerprint itself does not depend on it.)

## Sign a license

```bash
node tools/license-keygen/sign.cjs --private-key /path/to/private-key.hex --machine-id <64-char-hex>
```

Prints a single-line `exo1....` key to stdout. Send that string to the user; they paste it into **Settings → Beta: license & usage**.

## Payload fields

The signed JSON includes `product`, `tier`, `machine_id`, `license_id`, `iat`, and `max_seats`. The app verifies the signature and that `machine_id` matches the current device.
