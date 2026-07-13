# AI system commands (EXO)

This document describes the **allowlisted “AI actions”** feature: the assistant can end a reply with a structured `exosites-action` JSON block; the UI parses it and, when enabled in Settings, runs matching registered actions after the reply—never arbitrary shell from the model text.

Low-risk read-only integration tools (calendar lists, mail search) run without a second click when allowed. **High-risk** commands (`open_application`, `save_text_file`, cloud text uploads, …) open a confirmation modal before execution.

## Threat model

| Concern | Mitigation |
|--------|------------|
| Prompt injection (“ignore rules, run dangerous commands”) | **Default deny:** only catalog IDs in [`frontend/src/systemCommands/catalog.ts`](../frontend/src/systemCommands/catalog.ts) are accepted. Unknown IDs and bad args fail validation in the renderer and again in [`electron/systemCommandsV1.js`](../electron/systemCommandsV1.js). |
| Model emits a malicious URL | Allowlisted commands do not take arbitrary URLs from the model. **`open_application`** uses **curated launcher keys** only. Integration commands use **IDs**, **ISO datetime ranges**, and **enumerated caps**—not free-form paths. |
| Model emits a malicious path | **`open_output_folder`** does not take a path from the model; output uses settings. **`open_workspace_folder`** only accepts an **integer index** into the user’s authorized workspace list (IPC context from the renderer). **`save_text_file`** accepts only safe basenames under resolved directories. |
| Tokens in the chat model | OAuth tokens stay in **Electron main**; never paste tokens or refresh secrets into prompts. Tool results shown to cloud chat providers must stay **redacted** (see [`INTEGRATIONS.md`](INTEGRATIONS.md)). |
| Replay / double execution | Each execution uses a **fresh `requestId`** where logged in main. |

## Allowlist version

- **Catalog:** `frontend/src/systemCommands/catalog.ts` (`v: 1`). Includes navigation/help/tour, filesystem helpers, cloud uploads, and **read-only integration** commands such as `graph_calendar_list_events`, `graph_mail_search`, `google_calendar_list_events`, `gmail_search_messages`, `infomaniak_calendar_list_events`.
- **Optional prompt appendix:** [`frontend/src/systemCommands/toolAppendix.ts`](../frontend/src/systemCommands/toolAppendix.ts) (`buildAssistantToolAppendix`) — append to the assistant system prompt where chat is implemented so allowed IDs stay aligned with the catalog.
- **Main validation:** [`electron/systemCommandsV1.js`](../electron/systemCommandsV1.js) mirrors validation for `systemCommand:execute`.
- **Executors:** [`electron/ipc/systemCommandHandlers.js`](../electron/ipc/systemCommandHandlers.js) (registered from [`electron/ipcHandlers.js`](../electron/ipcHandlers.js)).

## User consent (Settings)

Under **Settings → Features**:

| Setting | Role |
|--------|------|
| `assistantToolsEnabled` | Master switch — when off, no `systemCommand:execute` from assistant flows. |
| `assistantToolsReadEnabled` | Read-only integration tools (calendar/mail list/search). |
| `assistantToolsWriteEnabled` | Higher-risk actions including uploads and **`open_application`**. |
| Per-capability toggles (`assistantInstalledToolIds`) | Outcome-first cards (email search, calendar, cloud upload, …) map to catalog command sets — see [`assistantFeatureCatalog.ts`](../frontend/src/systemCommands/assistantFeatureCatalog.ts). |
| Per-provider toggles | Microsoft / Google / Infomaniak — deny assistant use while accounts stay connected for sorting. |
| Tool follow-up | After a successful tool run, the renderer dispatches `ASSISTANT_TOOL_FOLLOWUP_READY_EVENT` for one short redacted summary turn (always on). |

## Chat surface wiring

When the chat layer finishes assembling the **full assistant message text** (including any `exosites-action` fenced JSON block), call [`notifyAssistantReplyComplete`](../frontend/src/systemCommands/assistantReplyNotify.ts). [`AssistantReplyToolBridge`](../frontend/src/components/AssistantReplyToolBridge.tsx) listens on `ASSISTANT_REPLY_COMPLETE_EVENT`, parses with `extractExositesAction`, applies gates, confirms high-risk commands, and invokes IPC.

## Audit log

Append-only JSON lines in the user data directory: **`system-command-audit.log`**.

- **Renderer:** `systemCommand:audit` for skipped gates, client-side outcomes.
- **Main:** execution handlers append lines where implemented.

## Rollback / disable

1. Turn off **Assistant capabilities** master toggle in Settings (immediate).
2. Narrow `SYSTEM_COMMAND_CATALOG` and validators if developing locally.

## Related files

| Area | File |
|------|------|
| Parse + strip fence | `frontend/src/systemCommands/parseExositesAction.ts` |
| Gates + high-risk confirm copy | `frontend/src/systemCommands/assistantExecutionGate.ts`, `AssistantReplyToolBridge.tsx` |
| Gmail search helper (local API) | `backend/routes/assistant_routes.py` (`POST /assistant/gmail-search`) |
| Executor switch | `electron/ipc/systemCommandHandlers.js` |
| Preload IPC | `electron/preload.js` |
| Renderer delegate (tab/help/tour) | `frontend/src/hooks/useSystemCommandDelegate.ts` |
