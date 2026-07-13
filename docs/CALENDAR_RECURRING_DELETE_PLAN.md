# Recurring calendar delete — engineering plan

**Created:** 2026-06-18  
**Status:** Engineering complete — manual QA against live Google/Outlook calendars pending  
**Audience:** Engineers implementing delete-scope support (“This event” / “This and following” / “All events”)  
**Depends on:** [`ASSISTANT_RESTRUCTURE_PLAN.md`](ASSISTANT_RESTRUCTURE_PLAN.md) (CalendarService, unified turn, voice confirm patterns)  
**Related:** [`VOICE.md`](VOICE.md), [`adr/011-assistant-when-to-orchestrate.md`](adr/011-assistant-when-to-orchestrate.md)

---

## How to use this in a new chat

> Execute **Phase N** of `docs/CALENDAR_RECURRING_DELETE_PLAN.md`. Do not skip acceptance criteria. Run tests after each phase.

Work **one phase at a time**. Phase 1 must pass before Phase 2 starts.

---

## Problem statement

Users expect the same delete choices Google Calendar and Outlook offer for recurring events:

| Scope | User expectation |
|-------|------------------|
| **This event** | Remove only the selected occurrence |
| **This and following** | Remove this occurrence and all future ones; keep past occurrences |
| **All events** | Remove the entire recurring series (past + future) |

**Today:** the assistant lists expanded instances (`singleEvents: true`), then calls plain `DELETE …/events/{id}` per match. That accidentally behaves like “this event only” for instances, but:

- Never asks which scope the user wants
- Cannot reliably delete an entire series (`recurringEventId` / master not exposed)
- “This and following” is impossible
- Bulk delete (“delete all WORK events”) may delete only instances in the list window, not the series the user meant

**Product failure mode:** user says “delete my weekly standup” and either one occurrence vanishes or many unrelated instances are removed — with no clear outcome.

---

## North star (UX)

1. **One sentence recap before delete** — title, date/time, and whether it’s recurring (e.g. “Weekly team standup, every Tuesday 10:00”).
2. **Explicit scope** — voice or UI must capture scope before any mutating API call.
3. **Same contract everywhere** — voice, typed chat, and REST use `CalendarService` delete-with-confirm (mirror create flow).
4. **Honest errors** — if the provider cannot represent a scope, say so in plain language; do not silently delete the wrong slice.

---

## Current architecture (baseline)

| Layer | Today |
|-------|--------|
| List | `google_workspace` / `microsoft_graph` `list_calendar_events`; Google uses `singleEvents: true` |
| Match | `capability_router.match_calendar_events_for_delete` — title needle → `event_id[]` |
| Delete | `CalendarService.bulk_delete` → loop `delete_calendar_event` (no scope) |
| Text chat | `handle_assistant_turn` → `_handle_calendar_delete` — immediate bulk delete, no confirm |
| Voice | `CapabilityRouter` → `bulk_delete` or single delete; instructions say “confirm name and time” but no scope |
| Create confirm (pattern to copy) | `services/calendar/confirm.py`, `CalendarCreateDraft`, voice + `/integrations/calendar/events/propose` |

**Key files:**

- `backend/actions/google_workspace_tool.py` — `_calendar_list_events`, `_calendar_delete_event`
- `backend/actions/microsoft_graph_tool.py` — same shape
- `backend/services/calendar/service.py` — extend here (not new parallel stack)
- `backend/services/routing/capability_router.py` — delete routing
- `backend/voice/tool_dispatch.py` — bulk delete branch
- `backend/services/assistant/turn.py` — text delete path

---

## Target architecture

```
backend/services/calendar/
  delete_draft.py      # CalendarDeleteDraft, build from list match
  delete_confirm.py    # recap, parse scope reply, execute
  delete_execute.py    # scope → provider ops (pure, testable)
  schemas.py           # + ProposeDeleteRequest, ConfirmDeleteRequest, RecurrenceScope
  service.py           # propose_delete(), confirm_delete(), delete_with_scope()

backend/actions/
  google_workspace_tool.py   # delete_calendar_event + recurrence fields on list
  microsoft_graph_tool.py    # parity

frontend/src/
  api/calendar.ts              # proposeDelete / confirmDelete
  utils/calendarDeleteConfirm.ts  # thin client + scope chip helpers
```

### Shared contract

```typescript
type RecurrenceScope = "this_instance" | "this_and_following" | "all_series";

type CalendarDeleteStatus =
  | "needs_confirmation"   // recap + scope question pending
  | "needs_scope"          // matched recurring; scope not yet chosen
  | "cancelled"
  | "deleted"
  | "failed";

interface CalendarDeleteDraft {
  tool_name: string;           // google_workspace | microsoft_graph
  calendar_id: string;
  event_id: string;            // instance or standalone id user matched
  recurring_event_id: string | null;  // series master, if recurring
  summary: string;
  start: string;               // ISO
  end: string;
  is_recurring: boolean;
  recurrence_label: string | null;  // plain language: "every Tuesday"
  source_text: string;
}

interface CalendarDeleteResponse {
  ok: boolean;
  status: CalendarDeleteStatus;
  recap?: string;
  draft?: CalendarDeleteDraft;
  scope_options?: RecurrenceScope[];  // omit for non-recurring
  deleted_count?: number;
  error?: string;
}
```

**REST (new):**

```
POST /integrations/calendar/events/propose-delete
POST /integrations/calendar/events/confirm-delete
```

`POST /integrations/calendar/events/bulk-delete` remains for **non-recurring bulk** only; recurring matches must go through propose-delete (or bulk propose returns N drafts — see Phase 4).

---

## Provider implementation matrix

### Google Calendar

| Scope | Implementation (authoritative) |
|-------|--------------------------------|
| **this_instance** | `DELETE /calendars/{cal}/events/{instanceId}` where `instanceId` comes from `singleEvents: true` list |
| **all_series** | `DELETE /calendars/{cal}/events/{recurringEventId}` using master id from list item |
| **this_and_following** | (1) `GET` master event; (2) `PATCH` master `recurrence` RRULE with `UNTIL` = end of day before selected instance (in series TZ); (3) `DELETE` instance ids from selected forward in window, or `instances` query + delete — **must be one transactional helper** with rollback logging on partial failure |

**List enrichment (required):** extend mapped event shape:

```python
{
  "id": ...,
  "summary": ...,
  "start": ...,
  "end": ...,
  "recurring_event_id": e.get("recurringEventId"),  # NEW
  "is_recurring_instance": bool(e.get("recurringEventId")),
  "recurrence": e.get("recurrence"),  # only on master if ever listed
}
```

### Microsoft Graph

| Scope | Implementation |
|-------|----------------|
| **this_instance** | `DELETE /me/calendar/events/{occurrenceId}` |
| **all_series** | `DELETE /me/calendar/events/{seriesMasterId}` |
| **this_and_following** | `PATCH` series master `recurrence.range.endDate` / split series per [Graph recurrence docs](https://learn.microsoft.com/en-us/graph/api/resources patternedrecurrence) |

**Phase 8** — Graph parity after Google path is green. Do not block Google MVP on Graph.

### Infomaniak

**Out of scope v1** unless product requires it. Document as “single-event delete only” until recurrence API is verified.

---

## Voice & text flows

### Non-recurring event

1. List → match one event  
2. Recap: “Delete **Budget review**, tomorrow at 14:00?”  
3. User: “yes” / “oui” → `this_instance` (only option) → delete  
4. Assistant: “Removed Budget review from your calendar.”

### Recurring event

1. List → match one instance  
2. Recap: “**Weekly standup** is recurring, Tuesdays at 10:00. Delete this occurrence only, this and future ones, or the entire series?”  
3. User reply (voice parser):
   - “this one” / “just this” / “cette fois” → `this_instance`
   - “this and following” / “all future” / “à partir de…” → `this_and_following`
   - “all” / “whole series” / “toute la série” → `all_series`
4. Optional confirm: “OK, removing this and all future standups.” → execute  
5. Assistant reports outcome in one sentence (count + scope in plain language)

### Typed chat

Same as voice via `POST /assistant/turn`:

- `write_calendar_delete` intent → `CalendarService.propose_delete` → message with recap + scope options  
- Pending delete draft stored in conversation (like `pending_calendar_draft` for create)  
- Short reply → `confirm_delete` with parsed scope  

**UI enhancement (Phase 7):** three tappable chips under the assistant message for scope — reduces voice ambiguity.

### Bulk utterances (“delete all WORK events”)

| Match result | Behavior |
|--------------|----------|
| 0 events | “No matching events.” |
| N non-recurring | Existing bulk delete (no scope question) |
| 1 recurring series (N instances in window) | **One** scope question for the series, then apply to master/instance set — not N separate deletes |
| M recurring + K standalone | Split: confirm each **series** once; bulk-delete standalone — cap at 3 series confirms per turn; otherwise ask user to narrow |

---

## Phase plan

### Phase 0 — ADR & contract (0.5 day)

**Deliverables**

- `docs/adr/013-calendar-recurring-delete-scope.md` — scope enum, provider rules, confirm-before-delete  
- JSON schema / TypeScript types checked into `services/calendar/schemas.py` + `frontend/src/api/calendar.ts`

**Acceptance**

- [ ] ADR reviewed; scope names frozen (`this_instance`, `this_and_following`, `all_series`)
- [ ] No implementation code in this phase

---

### Phase 1 — List enrichment & recurrence detection (1–2 days)

**Tasks**

1. Add `recurring_event_id`, `is_recurring_instance` to Google list mapping  
2. Add helper `describe_recurrence_label(recurrence_rules) -> str | None` for recap copy  
3. Unit tests with fixture JSON from real Google list responses (sanitized)  
4. Mirror fields for Graph list when `seriesMasterId` present  

**Acceptance**

- [ ] `test_google_calendar_list_includes_recurring_metadata`  
- [ ] `match_calendar_events_for_delete` unchanged behavior for non-recurring  
- [ ] No delete behavior change yet (read-only)

---

### Phase 2 — Provider delete executors (2–3 days)

**Tasks**

1. `backend/services/calendar/delete_execute.py`:
   - `execute_google_delete(scope, calendar_id, event_id, recurring_event_id, instance_start)`
   - `execute_microsoft_delete(...)` stub raising `NotImplementedError` until Phase 8  
2. Extend `google_workspace` `delete_calendar_event` to accept optional `scope` + `recurring_event_id` (internal dispatch only — **not** exposed on live Gemini tool schema yet)  
3. Implement `this_and_following` for Google with integration test (test account / recorded VCR)  

**Acceptance**

- [ ] `test_delete_this_instance_only`  
- [ ] `test_delete_all_series`  
- [ ] `test_delete_this_and_following` (Google)  
- [ ] Partial failure returns actionable error (“Removed 2 of 5 future events — open Google Calendar to finish”)

---

### Phase 3 — CalendarService propose / confirm delete (2 days)

**Tasks**

1. `CalendarDeleteDraft` + `build_delete_draft_from_event()`  
2. `format_delete_recap(draft) -> str` — includes scope question when `is_recurring`  
3. `parse_delete_confirm_response(text, draft) -> scope | reject | none`  
   - Reuse `parse_simple_confirm_reply` for non-recurring  
   - New scope regexes EN/FR/DE/IT (mirror create confirm i18n style)  
4. `CalendarService.propose_delete()` / `confirm_delete()`  
5. Routes: `propose-delete`, `confirm-delete`  

**Acceptance**

- [ ] `test_propose_delete_recurring_needs_scope`  
- [ ] `test_confirm_delete_this_and_following`  
- [ ] `test_confirm_reject_cancels_without_api_call`  
- [ ] Feature flag `ASSISTANT_CALENDAR_DELETE_CONFIRM=1` (default on)

---

### Phase 4 — Wire voice + CapabilityRouter (2 days)

**Tasks**

1. Replace `bulk_delete` immediate path for **single matched recurring** with `propose_delete` tool result (`status: needs_scope`)  
2. `tool_dispatch.py`: pending delete draft state (parallel to create draft)  
3. On scope + confirm → `confirm_delete`  
4. Update `voice_instructions.py`:
   - Recurring delete MUST ask scope in one sentence  
   - Never call `delete_calendar_event` until scope is known  
5. Deprecate direct `bulk_delete` for recurring series matches  

**Acceptance**

- [ ] `test_voice_recurring_delete_asks_scope`  
- [ ] Manual: French voice “supprime la réunion hebdomadaire” → scope question → “toute la série” → series gone  
- [ ] `test_voice_tool_redirect.py` updated — bulk WORK non-recurring still works  

---

### Phase 5 — Typed chat + `/assistant/turn` (1–2 days)

**Tasks**

1. Replace `_handle_calendar_delete` immediate bulk with propose → pending draft in turn result  
2. `AssistantTurnResult` fields: `calendar_delete_draft`, `calendar_delete_recap`  
3. Frontend: store pending delete draft on assistant message (mirror create)  
4. `runAssistantSendMessage` / `handleAssistantTurnActions` — confirm-delete branch  
5. `assistantIntent` unchanged (`write_calendar_delete`)  

**Acceptance**

- [ ] Text: “delete tomorrow’s standup” → recap + scope chips (if recurring)  
- [ ] Text: “all events” reply → full series delete  
- [ ] `test_assistant_turn_recurring_delete_propose`  

---

### Phase 6 — Frontend scope UI (1–2 days)

**Tasks**

1. `calendarDeleteConfirm.ts` — parse scope from chips or text; call `confirmDelete`  
2. Assistant message component: three buttons when `scope_options` present  
3. i18n keys: `calendar.deleteScopeThis`, `…Following`, `…All` (en/fr/de/it)  
4. E2E smoke: mocked propose-delete → tap “This and following” → confirm  

**Acceptance**

- [ ] Vitest: scope chip → API payload  
- [ ] E2E optional but recommended  
- [ ] No synthetic progress — buttons only appear after server `needs_scope`

---

### Phase 7 — Microsoft Graph parity (2 days)

**Tasks**

1. Graph list enrichment (`seriesMasterId`)  
2. `execute_microsoft_delete` three scopes  
3. Router tool selection when user’s calendar provider is Microsoft  

**Acceptance**

- [ ] Graph integration tests or recorded fixtures  
- [ ] Voice + text paths select `microsoft_graph` when that’s the connected calendar  

---

### Phase 8 — Hardening & rollout (1 day)

**Tasks**

1. Metrics/logging: `calendar_delete_scope`, `provider`, `deleted_count`, `partial_failure`  
2. Update `VOICE.md` and `ASSISTANT_RESTRUCTURE_PLAN.md` cross-links  
3. Rollout flag default on; `ASSISTANT_CALENDAR_DELETE_CONFIRM=0` restores legacy immediate bulk (emergency only)  

**Acceptance**

- [ ] `npm run quality` green  
- [ ] `pytest backend/tests/test_*calendar*` green  
- [ ] Manual QA checklist signed off (below)

---

## Test strategy

| Layer | Tests |
|-------|--------|
| Unit | `delete_execute.py` scope mapping; `parse_delete_confirm_response` EN/FR |
| Router | recurring vs bulk; single series vs multi |
| Service | propose/confirm; reject; patch nothing |
| HTTP | `propose-delete`, `confirm-delete` routes |
| Voice | golden transcripts for scope replies |
| Frontend | `calendarDeleteConfirm.test.ts` |
| E2E | optional mocked calendar API |

**Fixtures:** add `backend/tests/fixtures/google_recurring_list.json`, `google_series_master.json`.

**Manual QA checklist**

- [ ] Google: weekly event — delete **this** only; next week still exists  
- [ ] Google: weekly event — delete **all**; entire series gone in Google Calendar UI  
- [ ] Google: weekly event — delete **following**; past occurrences remain  
- [ ] Voice French + English scope phrases  
- [ ] Text chat with scope chips  
- [ ] “Delete all WORK events” with one recurring WORK series → one scope question, not 12 deletes  
- [ ] Gemini-only user (no Anthropic) — no `plan_and_execute` on delete path  

---

## Voice / copy standards

Recap template (recurring):

> **{title}**, {day} at {time} — repeats {recurrence_label}. Do you want to delete only this occurrence, this and future ones, or the entire series?

Scope reply examples to support:

| Scope | EN | FR |
|-------|----|----|
| This | “just this one”, “only this event” | “juste celui-ci”, “seulement cette fois” |
| Following | “this and following”, “all future” | “celui-ci et les suivants”, “tous les prochains” |
| All | “all events”, “entire series”, “whole thing” | “toute la série”, “tous les événements” |

Reject: reuse create-flow reject tokens (`non`, `cancel`, etc.).

---

## Feature flags

| Flag | Default | Purpose |
|------|---------|---------|
| `ASSISTANT_CALENDAR_SERVICE` | on | Master calendar service gate (existing) |
| `ASSISTANT_CALENDAR_DELETE_CONFIRM` | on | Propose/confirm delete vs legacy immediate bulk |

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Google `this_and_following` is easy to get wrong | Isolate in `delete_execute.py`; integration test against real API; idempotent PATCH |
| Voice mishears scope | Repeat recap once; UI chips in chat; default to **ask again**, never guess |
| Bulk delete deletes 50 instances not series | Detect `recurring_event_id` collapse before delete |
| Timezone / DST shifts recurrence | Use event `start.timeZone` from API; unit tests with DST boundary fixtures |
| Partial delete failure | Return honest count; do not claim full success |
| Graph API differences | Phase 7 isolated; Google MVP ships first |

---

## What NOT to do

- **Do not** expose `scope` on the live Gemini tool schema — scope comes from user confirm, not model args  
- **Do not** add frontend regex routing for delete — server `CalendarService` owns it  
- **Do not** use `plan_and_execute` for calendar delete  
- **Do not** fake “all events” by looping instance deletes without master delete  
- **Do not** implement Infomaniak recurrence in v1 without API verification  
- **Do not** ship without French voice scope phrases (product’s primary locales)

---

## Effort estimate (senior engineer team)

| Phase | Days |
|-------|------|
| 0 | 0.5 |
| 1 | 1–2 |
| 2 | 2–3 |
| 3 | 2 |
| 4 | 2 |
| 5 | 1–2 |
| 6 | 1–2 |
| 7 | 2 |
| 8 | 1 |
| **Total** | **~12–16 days** (one engineer); **~7–9 days** with two engineers on parallel Phases 2+3 and 5+6 after Phase 1 |

---

## Definition of done

Engineering is done when:

1. User can delete a recurring event with explicit scope in **voice and text**  
2. Google Calendar UI reflects the chosen scope correctly for all three options  
3. Non-recurring and bulk-non-recurring paths still work  
4. All acceptance criteria in Phases 0–8 are checked  
5. `docs/VOICE.md` documents the delete-scope conversation pattern  

---

## Suggested PR breakdown

| PR | Content |
|----|---------|
| PR-1 | ADR + schemas + list enrichment (Phase 0–1) |
| PR-2 | Google delete_execute + tests (Phase 2) |
| PR-3 | CalendarService propose/confirm + routes (Phase 3) |
| PR-4 | Voice + router (Phase 4) |
| PR-5 | Text turn + frontend API (Phase 5) |
| PR-6 | Scope chips UI + i18n (Phase 6) |
| PR-7 | Microsoft Graph parity (Phase 7) |
| PR-8 | Docs + rollout (Phase 8) |

Each PR must keep `npm run quality` green.
