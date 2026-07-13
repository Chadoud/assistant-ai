# Security notes

**Privacy & usage (high level):** Sorting runs on your machine; usage analytics and crash reports use **legitimate interest** (disclosed in Privacy Policy; **object** in Settings → Privacy). Gmail is read only when you start a mail-related action. **Google Drive** files are read and copied or exported to a **local staging folder** only when you start a sort that includes Drive (Workspace **Run sort**). Cloud sign-in anchors the 14-day free trial; license checks use your configured Exosites endpoints. **Last reviewed:** 2026-06-19.

**Keeping this document current (maintainers):** When you change telemetry (event names or props), Gmail/OAuth, entitlement or trial, cloud auth, or crash reporting — update **this file**, **`frontend/src/telemetry/schema.ts`**, **`backend/telemetry/schemas.py`**, and the **`settings.privacy*`** / **`welcome.privacy*`** / **`welcome.legal*`** strings in **every** `frontend/src/i18n/locales/*.ts`. Run `npm run check-locale-keys` in `frontend`. For end-user **terms / legal**, publish from **exosites-agency** (`src/translations/pages/appPrivacy.ts`, `appTerms.ts`) at https://exosites.ch/eng/app-privacy and `/eng/app-terms`; wire URLs via **`VITE_PRIVACY_POLICY_URL`** / **`VITE_TERMS_OF_SERVICE_URL`** (see `frontend/.env.example`, `npm run verify:legal-urls`). Historical draft in-repo: [`docs/POLICY_AND_TERMS_DRAFT.md`](docs/POLICY_AND_TERMS_DRAFT.md) (superseded).

---

## Renderer (Electron)

- Main and setup windows use **`contextIsolation: true`** and **`nodeIntegration: false`** ([`electron/windows.js`](electron/windows.js)).
- IPC is exposed only through small, explicit `preload` bridges ([`electron/preload.js`](electron/preload.js), [`electron/preload-setup.js`](electron/preload-setup.js)).
- Prefer keeping **filesystem and shell** operations in the main process via IPC, not in the React bundle.

## Python backend

- Treat all paths from clients as untrusted: normalize, reject `..` traversal, and scope reads/writes to intended roots where applicable.
- Keep dependencies pinned in [`backend/requirements.txt`](backend/requirements.txt) and rebuild the packaged binary after upgrades.

## Threat model (local desktop app)

- **Not a multi-tenant server:** The app assumes the **OS user** can read their own files and `userData`. Mitigations target **untrusted path strings** from the renderer/HTTP and **defense in depth** against mistakes — not protection against malware already running as the same user.
- **Remote code:** Unauthenticated network peers must not be able to invoke sort endpoints; bind the API to **loopback** in default configurations.
- **OAuth tokens** for Google live in the **local backend / Electron** store; treat the machine as trusted; wiping tokens = disconnect in UI or remove stored credentials. Integration OAuth tokens use Electron **safeStorage** in the main process and **fail closed** when OS encryption is unavailable (no new plaintext fallback writes).

## Distribution

- **Code signing** (Windows Authenticode, Apple Developer ID) and **verified updates** reduce tampering risk. See [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md).

## Reporting

- Use **Help → Copy diagnostics** in the app for version and connectivity context (no file paths). Do not paste secrets or full folder paths in public issues.

---

## Data handling (what the product touches)

### Local files and models

- **Classification and sorting** use the local Python backend and models you configure (for example Ollama on the same machine). File **contents and paths** stay in that pipeline unless you explicitly enable separate features below.
- **Product diagnostics** (on by default under legitimate interest; object in Settings → Privacy) never include file names, paths, folder names, prompts, or model text — see allowlisted events below.

### Gmail (Google)

- **OAuth:** After you connect Gmail, tokens are stored **locally** with the backend so the app can call the Gmail API.
- **When mail is accessed:** Message metadata and content you configure (search query, limits, text vs attachments) are read **only when you start** a Gmail import, a combined mail+files sort, or the explicit “Run sort with…” flow — not continuously in the background.

### Google Drive (sorting from Workspace)

- **Same Google sign-in** as Gmail (per-machine integration account).
- **When Drive is accessed:** The **Electron main** process uses your stored **Google** tokens to list or download via **Google Drive API**. For sorting, files are **written to a staging directory** under the app’s **user data** (e.g. `drive_sort_staging/`), and only **local paths** are sent to the Python **analyze** API — there is no separate “upload Drive to server” path for file contents.
- **User control:** Staging is created per import run; removing app **user data** (or the app’s data folder) clears staging and stored integration state as documented for your platform.

### Exosites cloud account (consumer builds)

- **Sign-in / registration** sends credentials to the **Exosites authentication** endpoints configured for that build so the app can enforce the 14-day free trial and license status. That is separate from optional usage analytics, which remain allowlisted and coarse.

### License and processing usage

- **Free trial / license** behavior is shown under Settings → **Trial & license**. Trial length is stored locally (`trial.json`) and, when signed in, anchored to your cloud account (`trial_ends_at`). See [`backend/trial_state.py`](backend/trial_state.py) and [`backend/entitlement_gate.py`](backend/entitlement_gate.py).

---

## First-run welcome (legal acceptance)

- On **Privacy & diagnostics**, users must agree to **Terms & Privacy** before **Next** or **Skip** on that step. The accepted bundle version is stored as `acceptedLegalTermsVersion` (see `LEGAL_TERMS_BUNDLE_VERSION` in [`frontend/src/constants.ts`](frontend/src/constants.ts)). Set **`VITE_PRIVACY_POLICY_URL`** and optionally **`VITE_TERMS_OF_SERVICE_URL`** for live legal links; if both are unset, a dev-oriented fallback line is shown—**publish URLs for production.**

## Product diagnostics and feedback (desktop app)

- **Legal basis:** Coarse **usage analytics** and **crash reports** are processed on **legitimate interest** (product reliability and improvement), as described in the [Privacy Policy](https://exosites.ch/eng/app-privacy). Accepting Terms on first run does not constitute analytics consent.
- **Objection (Art. 21):** Users may object in **Settings → Privacy** — uncheck **Usage analytics** and/or **Crash reports**. Objections persist in app settings (`telemetryOptIn`, `crashReportsOptIn`).
- When not objected, the client sends **coarse, allowlisted events** to the **local sorting API** (`POST /v1/telemetry/events`) and optional cloud mirror.
- **Allowlisted event names** (keep in sync with code): see [`frontend/src/telemetry/schema.ts`](frontend/src/telemetry/schema.ts) and [`backend/telemetry/schemas.py`](backend/telemetry/schemas.py).
- **Feedback** messages use **`POST /v1/telemetry/feedback`** (not gated by analytics objection); max length enforced server-side.
- **Local storage:** `backend/telemetry/data/telemetry.sqlite` (override `TELEMETRY_SQLITE_PATH`). **Retention:** **90 days** telemetry; activity timeline **14 days**.
- **Offline queue:** Electron may persist failed batches in `telemetry-offline-queue.json` and retry.
- **Crash reporting:** On by default when ingest is configured; objection in Settings. **Sentry** when `VITE_SENTRY_DSN` is set. Cloud ingest via `POST /v1/crash-reports` (backend `EXOSITES_CRASH_INGEST_*`). Scrubbing in [`frontend/src/telemetry/sentry.ts`](frontend/src/telemetry/sentry.ts) and [`frontend/src/telemetry/crashBackendIngest.ts`](frontend/src/telemetry/crashBackendIngest.ts).
- **Data rights:** Settings → Account → **Download my data** (`GET /v1/me/data-export`). **Delete account** (`DELETE /v1/me`) removes cloud telemetry, feedback, **crash reports**, sync metadata, and linked `app_sessions`. Local wipe: Settings → Privacy → **Erase local data**.
- **Mobile crash reporting** remains opt-in under Settings → Privacy. See [`mobile/lib/telemetry/mobile_crash_reporter.dart`](mobile/lib/telemetry/mobile_crash_reporter.dart).

### GO SYNC (encrypted relay)

- **Zero-knowledge relay:** The cloud stores **ciphertext blobs only** — no plaintext memories, mail, or file paths on the server.
- **Record integrity:** Each sync envelope includes a **`content_hash`** (SHA-256 of plaintext) so clients can detect tampering or corruption after decrypt. See [`sync/sync_crypto.py`](sync/sync_crypto.py) and [`mobile/lib/sync/sync_crypto.dart`](mobile/lib/sync/sync_crypto.dart).
- **Master key:** Generated on desktop during pairing; stored in OS secure storage on each device. Wiping local data or signing out removes device-side keys; cloud ciphertext remains until account deletion (`DELETE /v1/me`).
