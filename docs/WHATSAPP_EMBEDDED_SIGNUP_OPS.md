# WhatsApp Embedded Signup — operator checklist

Use this when enabling **one-click Business connect** in the desktop app (External sources → WhatsApp → **Connect with Meta**).

Manual paste remains available under **Advanced — paste credentials manually** for dev/test WABAs and until App Review is complete.

## What you need from Meta

1. **Meta Business app** at [developers.facebook.com](https://developers.facebook.com/apps/)
   - Product: **WhatsApp**
   - **Business verification** completed for production numbers
   - **App Review** approved for `whatsapp_business_messaging` (and related permissions used by Embedded Signup)

2. **Embedded Signup configuration**
   - Meta → WhatsApp → **Embedded Signup** → create a configuration
   - Copy the **Configuration ID** (`config_id`)

3. **App credentials** (Settings → Basic)
   - **App ID** → `META_APP_ID` on cloud-node (public to signed-in clients via connect-config)
   - **App Secret** → `META_APP_SECRET` on cloud-node only — never in desktop builds

4. **Webhooks** (same as manual flow)
   - `WHATSAPP_VERIFY_TOKEN` — any strong random string you enter in Meta → Configuration
   - `WHATSAPP_APP_SECRET` — same App Secret from step 3
   - Callback URL: `https://api.exosites.ch/v1/webhooks/whatsapp`
   - Subscribe to **messages** and **message_status**

## cloud-node `.env`

```env
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=your_embedded_signup_config_id
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_APP_SECRET=your_meta_app_secret
APP_BASE_URL=https://api.exosites.ch
```

Restart cloud-node after setting these. Desktop users must be **signed in to Exo Cloud** — token exchange runs on the server.

## Verify

1. Sign in on desktop → External sources → WhatsApp → **Connect business number**
2. Modal should show **Connect with Meta** (not only paste fields)
3. Complete Embedded Signup → pill **Business connected**, business number shown on card
4. Send a test from **? → Send test message** (works inside Meta's 24-hour reply window) or use an approved template listed under **Show approved templates**
5. Confirm health panel shows inbound count after a customer replies (polls within ~1 minute when webhooks are active)

## Meta app — OAuth redirect (HTTPS)

Meta requires **HTTPS** redirect URIs when **Enforce HTTPS** is on. Use your cloud API callback (not `http://127.0.0.1`):

**URI de redirection OAuth valides:**
```
https://api.exosites.ch/v1/oauth/whatsapp-embedded-signup/callback
```

Add to **Facebook Login for Business → Settings**:

- **Valid OAuth Redirect URIs:** `https://api.exosites.ch/v1/oauth/whatsapp-embedded-signup/callback`
- **Embedded Browser OAuth Login:** **Yes** (required for Exo’s in-app window)
- **Client OAuth login** and **Web OAuth login:** enabled
- **Enforce HTTPS:** Yes (keep on — the URI above is HTTPS)

Optional for legacy SDK testing only: `http://127.0.0.1:8792/` (requires **Enforce HTTPS → No**). The desktop app no longer uses a local loopback server — Embedded Signup uses Meta's onboard URL in an in-app window.

Deploy cloud-node after pulling this route, then restart the Infomaniak Node.js app.

## Limitations

- **Dev WABAs** created only in the Meta dashboard often **cannot** use Embedded Signup — use advanced paste for those.
- **Personal WhatsApp** is unchanged — no Meta setup; assistant uses WhatsApp Desktop.
- Embedded Signup does not replace **template approval** for cold outbound messages outside the 24-hour window.

## Post-connect health UI

After Business connect, open External sources → WhatsApp → **?** for webhook sync status, inbound count, test send, and approved templates.

## Related code

- Exchange: `cloud-node/lib/whatsappEmbeddedSignup.js`, `POST /v1/me/whatsapp/embedded-signup/exchange`
- Connect config: `GET /v1/me/whatsapp/connect-config`
- Desktop UI: `WhatsAppBusinessSetupModal.tsx`, `WhatsAppBusinessHealthPanel.tsx`, IPC `integration:exchangeWhatsAppEmbeddedSignup`
