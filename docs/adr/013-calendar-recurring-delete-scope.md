# ADR 013 — Recurring calendar delete scope

**Status:** Accepted  
**Date:** 2026-06-18

## Context

Users deleting recurring calendar events expect three scopes (Google Calendar / Outlook parity):

- **This event** — one occurrence
- **This and following** — this and future occurrences; past remain
- **All events** — entire series

The assistant previously deleted listed instance IDs without asking scope.

## Decision

1. **Scope enum (frozen):** `this_instance`, `this_and_following`, `all_series`
2. **Confirm before delete** — mirror calendar create: `CalendarService.propose_delete` → user scope → `confirm_delete`
3. **Scope from user only** — never a live Gemini tool parameter
4. **Google first** — Graph parity in same service layer
5. **Bulk collapse** — multiple instances of one `recurring_event_id` → one scope question

## Consequences

- `ASSISTANT_CALENDAR_DELETE_CONFIRM` flag (default on) gates new flow
- Legacy immediate `bulk_delete` remains for non-recurring-only matches when flag off
