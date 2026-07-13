# Settings UX audit — implementation register

Traceability for the settings UX simplification plan (chat “Open Models” fix, welcome/readiness, settings relocation). **All tracked items (Q1–Q7, M1–M6, S1–S5) are done.**

## Status legend

| Status | Meaning |
|--------|---------|
| Done | Shipped in code |
| Partial | Started, not complete |
| Backlog | Not started |

## Quick wins (Q1–Q7)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| Q1 | Default `automationPreset: balanced`, `minConfidence: null` | Done | `appSettingsHydration.ts` |
| Q2 | Welcome/sort copy: “Sort model” not “chat model” | Done | welcome slices en/de/fr/it |
| Q3 | Settings wires `openModelDownloadModal` for sort/vision | Done | `SettingsPanel.tsx`, `ActiveModelSection` |
| Q4 | `voiceAutoStart: false` default | Done | hydration |
| Q5 | App language under Files & sorting | Done | `SettingsAppLanguageSection.tsx` |
| Q6 | Sync in settings nav | Done | `settingsNav.ts` |
| Q7 | Dead i18n cleanup | Done | Removed obsolete welcome, persona, memory/task, rules keys |

## Medium (M1–M6)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| M1 | Unified “AI setup” overview card | Done | `SettingsAiSetupOverview.tsx` at top of AI provider group |
| M2 | Provider toggles in Advanced `<details>` | Done | Read-only linked-account status; connect via External sources |
| M3 | Voice settings copy unification | Done | Mic CTA opens Gemini setup; copy aligned en/de/fr/it |
| M4 | Welcome/readiness respects Gemini-only users | Done | `setupReadiness.ts`, `useWelcomeFlow.ts` |
| M5 | Sort system prompt in Settings, not Queue | Done | `SortInstructionsSettingsContent` in Settings; queue opens `SortInstructionsModal` |
| M6 | Automation preset simplified; confidence in expert | Done | Outcome hints; custom threshold only in expert `<details>` |

## Strategic (S1–S5)

| ID | Item | Status |
|----|------|--------|
| S1 | 3-tab Settings | Done | Side-nav tabs: Essentials / AI & voice / Privacy & account / Advanced |
| S2 | Derive provider flags from External Sources | Done | `assistantIntegrationProviders.ts`, gate + Settings status UI |
| S3 | Classification finetune relocation | Done | Advanced tab, collapsed shell; sliders kept for support tuning |
| S4 | 3-step welcome | Done | `WelcomeScreen.tsx` — Connect AI → Sort setup → Privacy |
| S5 | No confidence score in UI | Done | ReviewTable, SortPlanFriendly, FileCard — labels only |

## Chat prerequisite fix

| Item | Status | Files |
|------|--------|-------|
| “Open Models” opens Gemini setup, not Models settings | Done | `AssistantChatPanelCore.tsx`, `GeminiApiKeySetupModal.tsx`, `chatReadiness.ts`, `geminiChatSetup.ts` |

## Key modules

- **Readiness:** `setupReadiness.ts` (welcome vs sort), `chatReadiness.ts` (Gemini chat)
- **Settings entry:** `SettingsPanel.tsx`, `settingsNav.ts`, `settingsPanelSearch.ts`
- **Queue:** sort instructions removed from header; `queue.sortInstructionsInSettings` opens Settings
