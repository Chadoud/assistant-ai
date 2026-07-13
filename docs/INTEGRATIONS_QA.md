# Integrations QA checklist

Use before a beta or release candidate when **Settings → Integrations** is enabled. Primary platform: **Windows**; spot-check **macOS** for OAuth loopback.

## Google Drive

| Step | Pass? |
|------|--------|
| With `EXOSITES_GOOGLE_OAUTH_CLIENT_ID` set, **Connect** completes in the system browser and **getAccounts** shows connected | ☐ |
| **List recent files** returns metadata (no download) | ☐ |
| **Test connection** succeeds (Drive `about`) | ☐ |
| **Disconnect** clears connected state; list returns `not_connected` | ☐ |
| Optional: chat **`google_drive_upload_text`** with AI actions on — uploads a small `.txt` / `.md` (requires scopes including `drive.file`; reconnect if upgraded from read-only) | ☐ |

## Microsoft OneDrive (Graph)

| Step | Pass? |
|------|--------|
| Azure app: desktop redirect `http://127.0.0.1:<port>/callback`; env `EXOSITES_MICROSOFT_OAUTH_CLIENT_ID` set | ☐ |
| **Connect** completes; account shows connected | ☐ |
| **Test connection** succeeds (Graph `/me`) | ☐ |
| Optional: **`graph_onedrive_upload_text`** from chat uploads to OneDrive root | ☐ |
| **Disconnect** clears state | ☐ |

## Revocation (manual)

| Step | Pass? |
|------|--------|
| Revoke app access on the provider’s website; next **Test connection** or API use fails gracefully; **Reconnect** via Connect works | ☐ |

## Security spot-check

| Step | Pass? |
|------|--------|
| Tokens do not appear in renderer DevTools storage for chat; diagnostics IPC does not return raw tokens | ☐ |
