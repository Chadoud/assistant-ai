# WhatsApp integration — complete implementation plan

**Status:** v1 scaffold shipped (External sources card, Business API credential modal, basic Cloud send).  
**Target:** Production-grade assistant integration at the same bar as **Slack** (`slack_messaging` + token relay + voice connect).  
**Related:** [WHATSAPP_CLOUD.md](./WHATSAPP_CLOUD.md) (personal vs Business), [WHATSAPP_EMBEDDED_SIGNUP_OPS.md](./WHATSAPP_EMBEDDED_SIGNUP_OPS.md) (operator checklist), [INTEGRATIONS.md](./INTEGRATIONS.md).

---

## 1. Definition of done

WhatsApp is “fully functional” when all of the following are true:

| Criterion | Slack (reference) | WhatsApp (target) |
|-----------|-------------------|-------------------|
| External sources card | Yes | Yes (done) |
| Connect / disconnect UX | OAuth + setup guide | Business API modal + clear personal-desktop path |
| Voice `manage_connection` | `integration:connect` works | Opens setup or confirms desktop-ready state |
| Credential bridge to Python | `connector_credentials` + token relay | Same pattern — **no file-mirror-only path** |
| Dedicated assistant tool | `slack_messaging` | `whatsapp_messaging` |
| Tool registered in planner + voice | Yes | Yes |
| Health check on connect | Yes | Meta Graph `GET /{phone-number-id}` |
| Actionable errors | `_friendly_slack_error` | Meta error codes → plain language |
| Tests | `test_slack_tool.py`, IPC smoke | Unit + integration tests for tool + creds |
| i18n | en/de/fr/it | Full strings for card + modal + errors |
| Docs | INTEGRATIONS.md section | INTEGRATIONS.md WhatsApp section |

**Explicit product split (unchanged):**

- **Personal WhatsApp** — consumer account, contact names, desktop automation / deep links. No Meta OAuth exists; “connected” means *desktop app available*, not API credentials.
- **Business WhatsApp** — Meta Cloud API, E.164 numbers, templates for cold outreach, optional webhooks.

Both paths must be **visible to the assistant** (which path will run, and why).

---

## 2. Current state (v1 — shipped)

### Done

- External sources → **Messaging** group: Slack + WhatsApp with brand icons.
- `WhatsAppConnectionSection` + `WhatsAppBusinessSetupModal` + `WhatsAppBusinessHealthPanel`.
- Electron: `electron/integrations/whatsapp.js` — health check, test send, templates IPC.
- Backend: `backend/actions/whatsapp_tool.py` + branch in `send_message.py`.
- `manage_connection.py` aliases `whatsapp`.
- Operator checklist: `WHATSAPP_EMBEDDED_SIGNUP_OPS.md`.

### Not done (gaps)

1. **No `whatsapp_messaging` tool** — only generic `send_message`.
2. **Credentials** — `connector_credentials` / token relay (mirror file removed).
3. **Send path** — `whatsapp_tool.py` (Python) and `whatsapp.js` (Electron health/test only).
4. **Voice connect** — `integration:connect` has no `whatsapp` handler; modal-only setup.
5. **No token relay event** — `INTEGRATION_CHANGED_EVENTS` missing `whatsapp` in `integrationTokenRelay.ts`.
6. **Business API incomplete** — no templates, 24h session rules, webhooks, delivery status.
7. **No contact → phone resolution** for Cloud API.
8. **i18n** — WhatsApp strings English-only (de/fr/it missing).
9. **Tests** — minimal unit tests; no E2E, no send integration test with mocked Graph API.
10. **INTEGRATIONS.md** — no WhatsApp section (Slack has one).

---

## 3. Target architecture

Align with Slack unless Meta constraints force an exception.

```
┌─────────────────────────────────────────────────────────────────┐
│ External sources (renderer)                                      │
│  WhatsAppConnectionSection → WhatsAppBusinessSetupModal            │
└────────────────────────────┬────────────────────────────────────┘
                             │ IPC save / disconnect / health
┌────────────────────────────▼────────────────────────────────────┐
│ Electron main                                                    │
│  integration_accounts_v1.json (provider: whatsapp)             │
│  safeStorage-encrypted secrets                                   │
│  integration:getToken → JSON { phone_number_id, access_token }   │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /integration/token-relay
┌────────────────────────────▼────────────────────────────────────┐
│ Python backend                                                   │
│  connector_credentials["whatsapp"]                               │
│  whatsapp_tool.whatsapp_messaging(...)                           │
│  send_message → delegates to whatsapp_tool when platform=whatsapp│
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (outbound only in v1)
┌────────────────────────────▼────────────────────────────────────┐
│ Meta Graph API  graph.facebook.com/v21.0                         │
└─────────────────────────────────────────────────────────────────┘

Optional v2 inbound:
  Meta webhook → cloud-node → desktop poll/SSE → assistant context
```

**Status:** Phases 0–5 implemented. Mirror file and legacy modal removed; live docs: `INTEGRATIONS.md`, `WHATSAPP_EMBEDDED_SIGNUP_OPS.md`, `WHATSAPP_CLOUD.md`.

---

## 4. Phased delivery (historical — completed)

### Phase 0 — Hygiene & honesty (1–2 days)

**Goal:** Stop misleading UX; document truth in product copy.

| Task | Details |
|------|---------|
| Card copy | Distinguish **“Desktop messaging”** vs **“Business API connected”**; never imply OAuth for personal WhatsApp. |
| Send feedback | `send_message` / tool responses include `method`: `desktop_automation` \| `whatsapp_cloud_api` \| `deep_link` \| `clipboard_fallback`. |
| i18n | Port all `sources.whatsapp*` keys to de/fr/it. |
| INTEGRATIONS.md | Add WhatsApp section mirroring Slack format. |
| Deprecation note | ~~`whatsapp_cloud.py`~~ removed — use `whatsapp_tool.py` + `connector_credentials`. |

**Acceptance:** User can read External sources and understand two modes without reading docs.

---

### Phase 1 — Credential bridge + tool foundation (3–5 days)

**Goal:** Same credential path as Slack; single backend module owns Cloud API.

#### 1.1 Electron

| File | Change |
|------|--------|
| `electron/integrations/whatsapp.js` | Health check, test send, list templates (IPC). |
| `registerIntegrationAccountsHandlers.js` | `integration:getToken` for `whatsapp` (already partial) — return stable JSON blob. |
| `registerIntegrationOAuthHandlers.js` | On save: call `relay`-compatible shape; on disconnect: clear cache hint. |
| `integrationCore.js` | Export `PROVIDER_WHATSAPP`; document credentialsBased. |

#### 1.2 Frontend

| File | Change |
|------|--------|
| `integrationTokenRelay.ts` | Add `whatsapp: ["exosites:whatsapp-integration-changed"]`. |
| `connectorContext.ts` | Map `whatsapp` token for assistant turns (if needed for proactive). |
| `WhatsAppConnectionSection.tsx` | After save, trigger `relayConnectorTokens()`. |

#### 1.3 Backend

| File | Change |
|------|--------|
| `backend/actions/whatsapp_tool.py` | **New** — operations below. |
| `backend/connector_credentials.py` | Document `CONNECTOR_TOKEN_WHATSAPP` env override for CI. |
| `backend/tool_registry/handlers.py` | Register `whatsapp_messaging`. |
| `backend/tool_registry/declarations/integrations.py` | Declare tool + update `manage_connection` provider list. |
| `backend/agent/planner.py` | List `whatsapp_messaging` in planner copy. |
| `backend/voice_instructions.py` | When to use `whatsapp_messaging` vs `send_message`; Cloud vs desktop. |
| `backend/voice/tool_dispatch.py` | Timeout budget for `whatsapp_messaging`. |
| `backend/actions/send_message.py` | Delegate WhatsApp Cloud send to `whatsapp_tool` (single implementation). |
| ~~`backend/actions/whatsapp_cloud.py`~~ | **Removed** — merged into `whatsapp_tool.py`. |

#### 1.4 `whatsapp_messaging` operations (v1)

| Operation | Purpose |
|-----------|---------|
| `connection_status` | `{ personal_desktop: bool, business_api: bool, display_phone?: string }` |
| `send_text` | E.164 `to`, `text` — Cloud API only; clear error if not configured |
| `send_template` | `to`, `template_name`, `language_code`, `components?` — required for cold outreach |

Personal desktop send stays on **`send_message`** (automation) until/unless we add a unified op that picks the path internally.

#### 1.5 Tests

- `backend/tests/test_whatsapp_tool.py` — mock Graph API (httpx/responses).
- Extend `test_send_message.py` — Cloud path calls tool module.
- `electron/integrations/whatsapp.test.js` — health check parsing (optional).

**Acceptance:** With Business credentials saved, assistant turn relays token; `whatsapp_messaging` `send_text` succeeds in test with mocked Graph; no production dependency on mirror file.

---

### Phase 2 — Voice connect & manage_connection (1–2 days)

**Goal:** “Connect WhatsApp” from voice/chat opens the right UI or explains desktop-only.

| Task | Details |
|------|---------|
| `manage_connection.py` | For `whatsapp` + `connect`: return `client_action: open_whatsapp_setup` (new) instead of `integrationConnect`. |
| Renderer bridge | Handle `open_whatsapp_setup` → open External sources tab + modal (pattern: existing Settings deep links). |
| `integration:connect` | Optional: return `{ ok: false, reason: "use_setup_modal", openSetup: true }` for whatsapp. |
| Voice instructions | “Connect WhatsApp Business” → tool opens setup; personal WhatsApp needs no connect. |

**Acceptance:** Voice “connect WhatsApp for business messaging” opens setup modal on desktop.

---

### Phase 3 — Business API production rules (4–6 days)

**Goal:** Real Business sends don’t fail silently on Meta policy.

| Task | Details |
|------|---------|
| Template catalog | Cache approved templates via `GET /{WABA-ID}/message_templates` (store WABA id on save). |
| Session window | Before free-text send, optional check: last inbound message timestamp (requires webhook store — see Phase 4). |
| Error mapping | Map Meta codes (`131026`, `131047`, `132000`, etc.) to user copy + assistant hint (“use a template”, “invalid phone”). |
| Setup modal | Step for WABA ID (required for templates); link to Meta docs. |
| Assistant behavior | If `send_text` fails with template required → suggest template name or desktop path. |

**Acceptance:** Operator can send approved template to new number; free-text to active session works; failures are plain language.

---

### Phase 4 — Webhooks via cloud-node (5–8 days)

**Goal:** Inbound messages, delivery/read receipts, session window data.

| Component | Work |
|-----------|------|
| `cloud-node` | New route `POST /v1/webhooks/whatsapp` — verify Meta signature, store events per account. |
| Auth | Map Meta `phone_number_id` → Exo account (user opts in during setup; store mapping in DB). |
| Desktop | Poll or SSE `GET /v1/me/whatsapp/events` (or push via existing notification channel). |
| Backend | `list_recent_messages`, update session window for Phase 3. |
| Privacy | Retention TTL (e.g. 30 days); no message content in telemetry. |

**Acceptance:** Inbound reply appears in assistant context within polling interval; delivery status available for last outbound.

**Dependency:** Requires deployed `cloud-node` + public HTTPS URL registered in Meta app.

---

### Phase 5 — Polish & parity (2–3 days)

| Task | Details |
|------|---------|
| E2E | Playwright: External sources shows WhatsApp; modal validation (desktop stub). |
| Proactive | If Business connected, optional briefing hook (out of scope unless requested). |
| Remove mirror file | ~~Done~~ — `whatsapp_cloud.json` mirror removed. |
| Embedded Signup | ~~Done~~ — Meta Embedded Signup via onboard URL + cloud exchange. |

---

## 5. File checklist (new / major edits)

| Area | Files |
|------|-------|
| Backend tool | `backend/actions/whatsapp_tool.py`, `backend/tests/test_whatsapp_tool.py` |
| Registry | `tool_registry/handlers.py`, `declarations/integrations.py`, `agent/planner.py` |
| Voice | `voice_instructions.py`, `voice/tool_dispatch.py` |
| Connect | `manage_connection.py`, `frontend/.../client_action` handler for setup modal |
| Electron | `whatsapp.js`, IPC handlers, `preload.js`, `api-channels.manifest.json` |
| Frontend | `WhatsAppConnectionSection.tsx`, `WhatsAppBusinessSetupModal.tsx`, `integrationTokenRelay.ts` |
| Cloud | `cloud-node/routes/whatsappWebhook.js`, migration for event store |
| Docs | `INTEGRATIONS.md`, `WHATSAPP_EMBEDDED_SIGNUP_OPS.md` |

---

## 6. Testing matrix

| Layer | Cases |
|-------|--------|
| Unit | Credential parse; E.164 normalize; Graph error mapping; template payload shape |
| Integration | Token relay → `try_get_token("whatsapp")`; send_text mock 200/4xx |
| send_message | Cloud configured + phone → cloud; name only → desktop; neither → deep link |
| Electron IPC | save → health fail rolls back; disconnect clears token |
| E2E | Card visible; modal required fields; disconnect |
| Manual QA | Meta test number; template send; desktop “message Mom” |

---

## 7. Security & compliance

- Tokens **never** in logs, telemetry, or LLM context.
- Store only in `integration_accounts_v1.json` (encrypted) + in-memory cache.
- Business messaging: surface Meta opt-in / template requirements in setup modal footer.
- Webhook endpoint: verify `X-Hub-Signature-256`; rate limit; no PII in crash reports.
- Privacy policy link update when webhooks store message content on server.

---

## 8. Non-goals (v1–v2)

- Consumer WhatsApp Web API (does not exist).
- UI automation as “integration connect” (remain fallback in `send_message`).
- WhatsApp file import / Workspace sort block.
- Group chat management via Cloud API (defer).
- Multi-number Business accounts per device (single credential set v1).

---

## 9. External sources housekeeping (optional, parallel)

Not WhatsApp-specific but affects “External sources completeness”:

| Connector | Action |
|-----------|--------|
| S3, iCloud | Add to `EXTERNAL_SOURCE_ACCOUNT_GROUPS` or document why hidden |
| Slack icon | Already on PNG asset |

---

## 10. Suggested implementation order

```
Phase 0 (honesty + i18n)
    ↓
Phase 1 (credentials + whatsapp_messaging)  ← highest ROI
    ↓
Phase 2 (voice connect)
    ↓
Phase 3 (templates + errors)
    ↓
Phase 4 (webhooks — needs cloud-node deploy)
    ↓
Phase 5 (E2E, remove mirror)
```

**Minimum shippable “senior complete” for desktop assistant:** Phases **0 + 1 + 2 + 3** (no cloud-node dependency).  
**Full Business product:** Add Phase **4**.

---

## 11. Rollout checklist

- [x] Phase 1 merged; mirror removed
- [x] INTEGRATIONS.md updated
- [ ] Meta app in production mode (if shipping Business to customers)
- [x] Support runbook: template / 24h window errors mapped in `whatsapp_tool.py` + health panel
- [ ] Feature flag (optional): `whatsappBusinessEnabled` for staged rollout

---

## 12. Open decisions (resolve before Phase 3)

1. **Single tool vs split:** Keep `send_message` for desktop and `whatsapp_messaging` for Cloud only, or one tool with `mode` param?  
   **Recommendation:** Keep split — clearer planner routing; `send_message` stays platform-agnostic automation.

2. **Contact → phone for Cloud:** Resolve from user memory/contacts or require explicit number?  
   **Recommendation:** v1 explicit E.164; v2 memory key `whatsapp_phone:{name}`.

3. **Webhook storage:** cloud-node DB vs desktop-only poll of Meta (no server)?  
   **Recommendation:** cloud-node for multi-device future; desktop-only poll acceptable for Phase 3 session check if webhook delayed.

---

## 13. Reference implementation map (Slack → WhatsApp)

Copy structure, not logic — Meta has no OAuth loopback.

| Concern | Slack (read this) | WhatsApp (implement) |
|---------|-------------------|----------------------|
| Tool module | `backend/actions/slack_tool.py` | `backend/actions/whatsapp_tool.py` |
| Get token | `try_get_token("slack")` → bearer string | `try_get_token("whatsapp")` → JSON parse `{ phone_number_id, access_token }` |
| Friendly errors | `_friendly_slack_error` | `_friendly_whatsapp_error` |
| Tool dispatch | `slack_messaging(parameters)` | `whatsapp_messaging(parameters)` |
| Declaration | `declarations/integrations.py` → `slack_messaging` | Add `whatsapp_messaging` + extend `manage_connection` provider list |
| Handler map | `handlers.py` `"slack_messaging": slack_tool.slack_messaging` | Same pattern |
| Electron connect | `slack.connectSlackOAuth()` in `registerIntegrationOAuthHandlers.js` | **No OAuth** — `integration:saveWhatsAppCloudCredentials` only |
| Electron getToken | `registerIntegrationAccountsHandlers.js` → slack bearer | Return JSON string for whatsapp |
| Provider catalog | `providersCatalog.js` id `slack` | id `whatsapp`, `credentialsBased: true` |
| UI card | `SlackConnectionSection.tsx` | `WhatsAppConnectionSection.tsx` (exists) |
| Setup modal | `SlackOAuthSetupModal.tsx` | `WhatsAppBusinessSetupModal.tsx` |
| Token relay events | `integrationTokenRelay.ts` → `slack` | Add `whatsapp` key |
| Voice connect | `manage_connection` → `integration_connect` | `open_whatsapp_setup` (Phase 2) |
| Voice handlers | `useWorkspaceVoiceToolHandlers.ts` | Handle new action |

---

## 14. Token relay sequence (target — Phase 1)

```
1. User saves credentials in WhatsAppBusinessSetupModal
2. IPC integration:saveWhatsAppCloudCredentials
   → encrypt in userData/integration_accounts_v1.json (provider whatsapp)
   → Meta health check GET /{phone-number-id}
3. Modal onConfigured → relayConnectorTokens() (frontend)
4. collectConnectedIntegrationTokens() includes whatsapp if connected
5. integrationGetToken({ providerId: "whatsapp" }) → JSON blob
6. POST /integration/token-relay → connector_credentials.store_token("whatsapp", json)
7. whatsapp_tool._credentials() parses JSON from try_get_token("whatsapp")
8. whatsapp_messaging / send_message cloud path uses whatsapp_tool only
```

---

## 15. Meta Graph API reference (implement in `whatsapp_tool.py`)

Base: `https://graph.facebook.com/v21.0` (pin version constant).

| Action | Method | Path | Body / notes |
|--------|--------|------|----------------|
| Health (on connect) | GET | `/{phone-number-id}?fields=display_phone_number,verified_name` | Bearer token |
| Send text | POST | `/{phone-number-id}/messages` | `{ messaging_product: "whatsapp", to, type: "text", text: { body } }` |
| Send template | POST | `/{phone-number-id}/messages` | `{ type: "template", template: { name, language: { code }, components? } }` |
| List templates | GET | `/{waba-id}/message_templates` | Phase 3 |

**Recipient `to`:** digits only, country code, no `+` (normalize in one function shared with tests).

**Common errors to map (Phase 3):**

| Code / message | User-facing hint |
|----------------|------------------|
| `(#131026)` / template | Use an approved template or message via desktop WhatsApp |
| `(#131047)` / re-engagement | Outside 24h window — use template or desktop |
| `(#100)` invalid parameter | Check phone number includes country code |
| `(#190)` access token | Re-enter Business API credentials in External sources |

---

## 16. Phase checklists (track in PR description)

### Phase 0
- [x] Card copy: Desktop vs Business distinct
- [x] `send_message` returns `method` in all paths
- [x] i18n de/fr/it for `sources.whatsapp*`
- [x] INTEGRATIONS.md WhatsApp section
- [x] Tests: connectors.test.ts green

### Phase 1
- [x] `whatsapp_tool.py` + tests
- [x] Registered in tool_registry + planner + voice
- [x] Token relay end-to-end
- [x] `send_message` delegates to tool
- [x] Mirror deprecated — removed (`whatsapp_cloud.py` / `whatsapp_cloud.json`)
- [x] pytest + providersCatalog.test.js green

### Phase 2
- [x] `open_whatsapp_setup` client action
- [x] Voice handler opens modal
- [x] manage_connection tests updated

### Phase 3
- [x] WABA ID required for templates
- [x] `list_templates` operation
- [x] Error mapping table covered in tests
- [x] Post-connect health panel (webhook sync, inbound count, test send, template list)

### Phase 4
- [x] cloud-node webhook + signature verify
- [x] Account ↔ phone_number_id mapping
- [x] Desktop poll endpoint
- [x] Retention policy documented (`INTEGRATIONS.md` § WhatsApp data retention)

### Phase 5
- [x] E2E smoke (optional)
- [x] Mirror file removed
- [x] Plan doc checkboxes updated

---

## 17. Verification commands (run after each phase)

```bash
# Backend
cd backend && python -m pytest tests/test_whatsapp_tool.py tests/test_send_message.py tests/test_whatsapp_health_route.py -q

# Electron provider catalog
cd electron && node --test integrations/providersCatalog.test.js

# Frontend connectors registry
cd frontend && npm run test -- --run src/externalSources/connectors.test.ts

# Slack regression (credentials pattern unchanged)
cd backend && python -m pytest tests/test_slack_tool.py -q
```

Manual QA (desktop app):

1. External sources → Messaging → WhatsApp card visible with icon  
2. Set up Business API with Meta test credentials → pill **Business API connected**  
3. Chat: “send WhatsApp to +1…” → cloud path if configured  
4. Chat: “message Mom on WhatsApp …” → desktop automation path  
5. Voice: “connect WhatsApp business” → setup modal opens (Phase 2+)

---

## 18. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Desktop automation breaks on WhatsApp UI update | Keep as fallback; document; prefer Cloud for Business users |
| Meta rejects cold free-text sends | Phase 3 templates + clear errors; desktop for personal |
| Token in mirror file vs relay drift | Phase 1 single source: connector_credentials |
| User expects OAuth for personal WhatsApp | Phase 0 copy; never show “Connect” for personal-only |
| cloud-node webhook scope creep | Phase 4 gated; ask before deploy |

---

## 19. `whatsapp_messaging` tool sketch (Phase 1)

```python
def whatsapp_messaging(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    operations:
      connection_status — no params
      send_text — to (E.164 digits), text
      send_template — to, template_name, language_code, components (optional)
    """
```

Return shape (match Slack):

```python
{"ok": True, "data": {...}}  # success
{"ok": False, "error": "plain language"}  # failure
```

`connection_status` data example:

```json
{
  "business_api_configured": true,
  "display_phone_number": "+41 ...",
  "personal_desktop_hint": "Contact names use WhatsApp on your computer, not Cloud API."
}
```

---

## 20. Voice / planner routing (Phase 1 copy)

Add to `voice_instructions.py` (paraphrase in implementation):

- User asks to **message a person by name** on WhatsApp → **`send_message`** (platform whatsapp), not `whatsapp_messaging`.
- User asks to send to a **phone number** and Business API is connected → **`whatsapp_messaging`** `send_text`.
- User asks to **connect WhatsApp** for business → **`manage_connection`** connect (Phase 2 opens setup modal).
- Cold outreach to new numbers → **`send_template`** if Business connected; else explain desktop or template setup.

