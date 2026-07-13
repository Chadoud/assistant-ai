# Beta slice: what to ship first

This documents the **default recommendation** for a first public or semi-public beta. Aligns with [BETA_RELEASE.md](BETA_RELEASE.md).

## Recommended default: **local-only beta**

| Aspect | Choice |
|--------|--------|
| **Accounts** | Do **not** set `EXOSITES_CLOUD_URL` for the packaged app. Users run Ollama locally; no cloud login gate. |
| **Positioning** | Matches the product story: classification runs on-device; no file contents uploaded for sorting. |
| **Operational load** | You avoid deploying and monitoring a cloud API before you have installer feedback. |

**When to use account-gated beta instead:** You already run the Exosites cloud API over HTTPS, you want quota tied to accounts, and you are ready to support auth/session issues. See [BETA_RELEASE.md](BETA_RELEASE.md) (Beta accounts).

## Improvement signals (expectations)

- **Usage telemetry** is opt-in and, today, stored in **local SQLite** on each machine (bundled backend). It does not automatically appear in a central dashboard unless you add forwarding or export (see [BETA_RELEASE.md](BETA_RELEASE.md) Phase 5 / central signals).
- **Crash reports** can reach you centrally if you build with `VITE_SENTRY_DSN` and users opt in under **Settings → Privacy**.
- **Qualitative feedback:** in-app feedback (local API), plus an optional **external beta link** via `VITE_BETA_FEEDBACK_URL` (form, Discord, GitHub Discussions).

Decision recorded: **ship local-only first** unless cloud is already production-ready.
