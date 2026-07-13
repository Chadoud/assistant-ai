# Cloud integrations (third-party OAuth)



Third-party integrations (Google Drive, Microsoft OneDrive via Graph) are **separate** from the in-app **cloud account** used for licensing / entitlement (`electron/cloudAuth.js`).



## Security



- Tokens are stored in the main process under `userData` in `integration_accounts_v1.json` with **Electron `safeStorage`** when the OS supports it (`electron/integrations/storage.js`). Fallback base64 (marked `plain`) is only used when encryption is unavailable.

- **Never** pass access or refresh tokens to the chat model or telemetry payloads.

- Outbound HTTP from integrations targets **provider APIs only** (Google APIs, Microsoft Graph) from the main process.



## Google OAuth (desktop / loopback)



- Set **`EXOSITES_GOOGLE_OAUTH_CLIENT_ID`** to a Google Cloud **Desktop** OAuth client ID.

- In Google Cloud Console, add **Authorized redirect URIs** using the loopback pattern: `http://127.0.0.1:<port>/callback` (the app listens on a random port per connect).

- The user signs in via the **system browser**; the main process exchanges the code with PKCE (`electron/integrations/google.js`).

- **Scopes:** `gmail.readonly`, `drive.readonly` (list metadata), and **`drive.file`** (create/upload files created by this app). Users who previously connected with a smaller scope set must **connect again** so Google re-issues a refresh token for the full set.

### Google Calendar (assistant tools — separate OAuth slot)

- **Provider id:** `google-calendar` (External sources card). Uses the same Google OAuth client id as Gmail/Drive (**`EXOSITES_GOOGLE_OAUTH_CLIENT_ID`**).
- **Scope:** `https://www.googleapis.com/auth/calendar.readonly` — read-only events for allowlisted assistant commands; independent refresh token storage from Gmail (`google-gmail`) and Drive (`google-drive`).
- Reconnect after enabling Calendar if your existing tokens predate this scope.

### Connect all (Google — desktop External sources)

- **Connect all** runs a single OAuth consent with the **union** of Gmail, Drive, and Calendar scopes, then stores the same refresh token in all three slots (`google-gmail`, `google-drive`, `google-calendar`) and mirrors Gmail tokens for Python as usual. Enable **Gmail API**, **Google Drive API**, and **Google Calendar API** in the same Google Cloud project as **`EXOSITES_GOOGLE_OAUTH_CLIENT_ID`**.

### Google workspace & sort (Gmail + Drive)



- **One sign-in (desktop):** `integration:connect` with provider `google` (either External sources card) runs PKCE in the main process, stores tokens in `userData/integration_accounts_v1.json`, and **mirrors** the same tokens to `~/.ai-file-sorter/gmail_oauth.json` for Python (`electron/integrations/google.js`). **Disconnect** clears both. Re-connect if you previously used Gmail-only or Drive-only tokens so the refresh token covers **Gmail + Drive** scopes together.

- **Web UI without Electron:** Gmail still uses the Python loopback OAuth flow into `gmail_oauth.json` only. Google Drive listing/import remains **desktop-only** (Electron IPC).

- **Gmail API** (backend): Importing mail, status, and **`POST /analyze/with-sources`** use tokens from `gmail_oauth.json` (mirrored on desktop or written by the web Gmail flow) — see [`backend/routes/gmail_routes.py`](../backend/routes/gmail_routes.py) and [`backend/gmail_google_oauth.py`](../backend/gmail_google_oauth.py).

- **Google Drive API** (Electron main): **Listing** folders/files uses **`integrationListGoogleDriveFiles`** (Drive `files.list` with `q` for parent). **Sorting** selected files does **not** stream file bytes to the FastAPI process from Google over a custom protocol; the main process **downloads or exports** to disk, then passes **local absolute paths** to the existing analyze API:

  - IPC: **`integration:importGoogleDriveFiles`** → `window.electronAPI.integrationImportGoogleDriveFiles({ fileIds })`.

  - Staging: e.g. `userData/drive_sort_staging/<random>/` (see [`electron/integrations/ipc.js`](../electron/integrations/ipc.js) and [`electron/integrations/google.js`](../electron/integrations/google.js)). User can clear staging by clearing app data / userData.

  - **Limits:** Import caps (file count, size) are enforced in the main process before paths are returned.

- **Workspace “Run sort”** ([`QueuePanel`](../frontend/src/components/QueuePanel.tsx)): Merges staged local paths, optional Gmail slice, and optional Drive import in one user action when enabled on the cards.



## Microsoft / OneDrive (Graph, PKCE)



- Set **`EXOSITES_MICROSOFT_OAUTH_CLIENT_ID`** to an Azure AD **single-tenant or multitenant** app configured as a **public client** with **mobile and desktop** redirect URIs: `http://127.0.0.1:<port>/callback` (random port per connect, same pattern as Google).

- **Scopes (Graph):** `User.Read`, `Files.ReadWrite`, `offline_access`, `openid`, `profile`, **`Mail.Read`** (Outlook mail surfaces), **`Calendars.Read`** (assistant calendar list tools). Outlook mail/calendar and OneDrive share one Microsoft session.

- **Connect all (External sources header):** Same single sign-in as either card — `integration:connect` with `providerId` **`microsoft`** fills the shared Graph session for OneDrive and Outlook.

- **First cloud write command:** allowlisted **`graph_onedrive_upload_text`** uploads a small `.txt` / `.md` to the user’s OneDrive root via Graph (`PUT /me/drive/root:/filename:/content`). Validation mirrors `save_text_file` basename rules.



## Infomaniak (kDrive + calendar)

- **kDrive** uses provider id `infomaniak` (drive scope). **Calendar** for assistant read-only tools uses provider id **`infomaniak-calendar`** — a separate OAuth token row with the **calendar** scope in the Infomaniak Manager API. Both use **`EXOSITES_INFOMANIAK_CLIENT_ID`**; External sources shows two cards so users can connect imports and calendar independently.

- **Connect all (desktop):** `integration:connect` with **`infomaniak-all`** runs one PKCE flow. With no explicit scope env overrides, Infomaniak uses the scopes configured in Manager; when both kDrive and Calendar are enabled there (or drive + calendar scope strings are combined via env), the same tokens are written to both **`infomaniak`** and **`infomaniak-calendar`** storage keys.

## Notion (assistant tool — authorization code + secret)

- **Provider id:** `notion` (External sources card). Backend assistant tool name: `notion` (operations `search`, `read_page`, `create_page`, `append_text`, `query_database`). No Workspace import block — assistant access only.
- **Why not PKCE:** Notion's public OAuth does **not** support PKCE and requires the **client secret** for the token exchange (HTTP Basic). Set both **`EXOSITES_NOTION_CLIENT_ID`** and **`EXOSITES_NOTION_CLIENT_SECRET`** (Electron main process only; secret stays in the user's local `.env`).
- **Fixed loopback port:** Notion does **not** honor RFC 8252 port-agnostic loopback matching, so the redirect URI uses a **fixed** port and must be registered **verbatim** in the integration's *OAuth Domain & URIs*: `http://localhost:8731/callback` (`electron/integrations/notion.js`). Use `localhost`, not `127.0.0.1` — Notion's Connections portal rejects a raw loopback IP and auto-prepends `https://`.
- **Tokens:** Notion access tokens are long-lived (no refresh token); `getValidAccessToken` just returns the stored token and `refreshStoredTokens` is a no-op. Stored under storage key `notion` in `integration_accounts_v1.json`; relayed to the backend via `connector_credentials` (provider id `notion`).
- **Sharing model:** the integration only sees pages/databases the user explicitly shares with it (page → ••• → Connections → add integration). 401/403 errors from the tool tell the user to share the page or connect the account.

## Slack (assistant tool — user OAuth)

- **Provider id:** `slack` (External sources card). Backend assistant tool name: `slack_messaging` (operations `list_channels`, `get_channel_history`, `search_messages`, `list_users`, `send_message`). No Workspace import block — assistant access only (file scopes remain available for future import paths).
- **OAuth:** Slack OAuth v2 with **user token scopes** requested at connect (`electron/integrations/slack.js`). User signs in via the system browser; loopback redirect `http://127.0.0.1:<port>/callback`. Add **`http://127.0.0.1`** under Redirect URLs in your Slack app (Slack accepts loopback on any port for desktop OAuth).
- **Credentials:** paste Client ID + Secret in the in-app setup guide (encrypted with `safeStorage`, like Notion) or set **`EXOSITES_SLACK_CLIENT_ID`** and **`EXOSITES_SLACK_CLIENT_SECRET`** in the Electron `.env`.
- **User token scopes:** `channels:read`, `groups:read`, `im:read`, `mpim:read`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `chat:write`, `search:read`, `users:read`, `files:read`.
- **Tokens:** stored under storage key `slack` in `integration_accounts_v1.json`; relayed to the backend via `connector_credentials`. Slack user tokens do not expire — reconnect only when expanding scopes or rotating the app secret.
- **UX:** if messaging fails with missing permissions, disconnect Slack on the External sources card and connect again so Slack re-issues a token with the full scope set.

## WhatsApp (personal desktop + optional Business Cloud API)

- **Provider id:** `whatsapp` (External sources → Messaging). Two paths:
  - **Personal:** `send_message` with platform `whatsapp` — opens WhatsApp on the desktop and automates contact search by name. No OAuth.
  - **Business:** `whatsapp_messaging` tool — Meta Cloud API for E.164 phone numbers (`send_text`, `send_template`, `list_templates`, `connection_status`).
- **Business credentials:** Phone number ID + permanent access token from [Meta for Developers](https://developers.facebook.com/). Saved encrypted in Electron `integration_accounts_v1.json`; relayed to Python via `connector_credentials` (JSON token payload, not a bearer string).
- **Voice / chat connect:** `manage_connection` with provider WhatsApp returns `open_whatsapp_setup` — opens External sources and the setup modal (not OAuth autopilot).
- **Webhooks (cloud-node):** Register `https://api.exosites.ch/v1/webhooks/whatsapp` in Meta with `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` on the server. Desktop registers `phone_number_id` → cloud account on save, polls `GET /v1/me/whatsapp/events`, relays to local `POST /integration/whatsapp-events-relay` for session-window checks and delivery status.
- **Embedded Signup (optional):** When cloud-node has `META_APP_ID`, `META_APP_SECRET`, and `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`, the setup modal shows **Connect with Meta** instead of manual IDs. See [WHATSAPP_EMBEDDED_SIGNUP_OPS.md](./WHATSAPP_EMBEDDED_SIGNUP_OPS.md).
- **Setup modal (External sources → WhatsApp → ?):** After connect, shows health (webhook sync, inbound count from cloud poll), **Send test** to an E.164 number, and **approved templates** list. Free-text tests only work inside Meta's 24-hour reply window unless you use a template.
- **Session window:** `whatsapp_messaging` `check_session` / `send_text` use cached inbound events (24h rule). Without webhooks configured, free-text to cold numbers should use `send_template`.
- **Security:** Never pass access tokens to the LLM or telemetry.
- **Data retention:** Cloud-node stores webhook events per account for **30 days** by default (`WHATSAPP_EVENT_RETENTION_DAYS` on the server). Purge runs on each webhook delivery and events poll. Local backend keeps up to **500** recent events in memory for session-window checks (cleared on privacy wipe / app restart). Message bodies in cloud storage use a short preview only — not full content in telemetry.

## Feature flag



- `integrationsEnabled` in app settings (default **off**) gates the Settings UI until the user opts in.



## IPC surface (main process)



| Channel | Purpose |

|--------|---------|

| `integration:listProviders` | Provider catalog: capabilities, human-readable **capability labels**, scopes summary, dashboard links, `oauthConfigured` |

| `integration:getAccounts` | Connected state per provider |

| `integration:connect` / `integration:disconnect` | OAuth or clear tokens (`providerId`: `google` \| `microsoft`) |

| `integration:healthCheck` | `{ providerId }` — non-secret check (e.g. Drive `about`, Graph `/me`) → `{ ok, reason? }` |

| `integration:listGoogleDriveFiles` | Read-only file metadata (folder children or flat list) |

| `integration:importGoogleDriveFiles` | Download/export selected file IDs to a staging dir; returns `localPaths` for the Python `/analyze` API |



Preload: `electron/preload.js` exposes these on `window.electronAPI`.



## Telemetry



- Integration connect/disconnect/list actions are **not** sent as dedicated telemetry events in the current build.

- If you add usage analytics later, record **feature usage counts only** — never file names, OAuth codes, or tokens. Align with existing `telemetryOptIn` gating in the renderer.



## Explicit non-goals (v1)



- **Generic desktop UI automation** (COM, UI Automation, AppleScript) to “drive” arbitrary apps is **out of scope** for this integrations panel. It would need a separate **experimental** feature flag, a clear threat model, and per-OS QA. Prefer **OAuth + REST** (Google, Graph) for provider-backed automation.



## Related docs



- Manual QA checklist: [INTEGRATIONS_QA.md](INTEGRATIONS_QA.md)

- AI allowlisted commands: [AI_SYSTEM_COMMANDS.md](AI_SYSTEM_COMMANDS.md)

