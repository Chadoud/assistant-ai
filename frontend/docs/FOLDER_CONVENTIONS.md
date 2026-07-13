# Frontend folder conventions (token-efficient refactors)

This doc is the single place for **where new code goes** after roadmap refactors. Prefer **vertical slices** (product area) over dumping files in flat `components/`.

## Heat map (large files — prioritize splits / partial imports)

| Area | File | Approx. lines | Notes |
|------|------|---------------|--------|
| Assistant UI | `src/components/AssistantChatPanel.tsx` | ~900+ | Split into `src/features/assistant/chat/` (shell, hooks, composer, messages, voice). |
| i18n | `src/i18n/locales/en.ts` (and de/fr/it) | ~2200+ | Migrate namespaces into `locales/<locale>/<namespace>.ts`; merge in parent bundle. |
| Global CSS | `src/index.css` | ~840 | Tailwind + `@import` only; tokens / Exo / toasts in `src/styles/*.css`. |
| Tools | `src/systemCommands/catalog/*.ts` + `catalog.ts` | split | Domain slices under `catalog/`; `catalog.ts` + `catalogMeta` aggregate. |
| Backend jobs | `backend/job_service/` (`_impl.py`, `analyze_support.py`) | package | Public API: `from job_service import JobService`. |
| Electron | `electron/systemCommandsV1/` + `integrations/infomaniak/` | split | Caps + validator modules; Infomaniak shared constants. |

## Target layout (incremental — not all at once)

- `src/features/<domain>/` — assistant chat, future slices. Co-locate `hooks/`, `components/`, `*.test.ts`.
- `src/components/` — shared UI shells, cross-tab chrome (TitleBar, modals), and legacy until moved.
- `src/styles/` — global CSS partials imported from `index.css` (tokens, Exo, Sonner).
- `src/i18n/locales/<locale>/` — partial message modules (e.g. `welcome.ts`) merged via spread into `en.ts` / `de.ts` / …

## Rules of thumb

- Hand-written modules: aim **&lt; ~300 lines**; split when a file needs "and" to describe it.
- Avoid giant barrel `index.ts` re-exports that force pulling the whole tree.
- Keep `localeKeyParity.test.ts` green when touching i18n keys.
