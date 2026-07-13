# WhatsApp: personal desktop vs Business Cloud API

Exo supports two WhatsApp paths — they are intentionally separate.

## Personal (desktop app)

- **No setup** on External sources.
- The assistant uses `send_message` with platform `whatsapp` to open WhatsApp Desktop and message **contacts by name**.
- Consumer WhatsApp has no OAuth or Cloud API for personal accounts.

## Business (Meta Cloud API)

- **Optional** connect under External sources → WhatsApp → **?** or **Connect with Meta**.
- Credentials stay encrypted on the device and relay to the local backend via `connector_credentials`.
- The assistant uses `whatsapp_messaging` for **E.164 phone numbers** (`send_text`, `send_template`, `list_templates`, etc.).
- **24-hour session window:** free-text only after the customer replied recently; otherwise use an approved template or the desktop path.
- **Webhooks:** configured on cloud-node — see [INTEGRATIONS.md](./INTEGRATIONS.md) and [WHATSAPP_EMBEDDED_SIGNUP_OPS.md](./WHATSAPP_EMBEDDED_SIGNUP_OPS.md).

## What we do not do

- UI automation inside the personal WhatsApp Desktop client for typing/sending (fragile, high security risk).
- Storing access tokens in telemetry or LLM context.
