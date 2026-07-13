# ADR-001: E2E Sync Cryptography

## Status

Accepted

## Context

GO SYNC requires a zero-knowledge relay: the server stores ciphertext only. Users must decrypt on device with keys derived locally.

## Decision

- **Master key:** Argon2id(password, account_salt, ops=3, mem=64MB) → 32-byte key
- **Per-record keys:** random 32-byte keys, wrapped with master key (XChaCha20-Poly1305)
- **Blob payload:** XChaCha20-Poly1305 with unique 24-byte nonce per revision
- **Library:** Python `cryptography` (already in backend requirements)

## Consequences

- Password change triggers local re-wrap of record keys; relay never sees plaintext
- Mobile pairs via QR that exchanges wrapped master key material (see ADR-003 pairing flow)
