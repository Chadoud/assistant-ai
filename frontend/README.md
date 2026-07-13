# Frontend — EXO UI

React 19 + TypeScript + Vite + Tailwind renderer for the desktop app (and the
browser-only demo). The app-wide overview, dev workflow, and architecture live
in the [root README](../README.md) and [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Commands (from this directory)

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server on `http://127.0.0.1:5173` (expects the backend on `127.0.0.1:7799`) |
| `npm run build` | Type-check (`tsc -b`) + production build to `dist/` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit suite |
| `npm run check-locale-keys` | Locale key parity across en/de/fr/it (CI gate) |
| `npm run check:unused:strict` | Knip — unused files/exports/types (CI gate) |

## End-to-end (Playwright)

Install browsers once (`npm run test:e2e:install`), then run `npm run test:e2e`.
The config starts the Vite dev server automatically. Tests include a Sort-tab
smoke load, a navigation check, and the core sort happy path (mocked classifier).
CI runs the same suite on push and pull requests (Chromium).

From the **repo root**, `npm run quality` runs lint, production build, unit
tests, backend pytest, and this E2E suite (see [`docs/BETA_RELEASE.md`](../docs/BETA_RELEASE.md)).

## Build-time variables

See [`.env.example`](.env.example): `VITE_API_BASE` (browser demo),
`VITE_PRIVACY_POLICY_URL` / `VITE_TERMS_OF_SERVICE_URL` (legal links, baked in
CI for installers), `VITE_SENTRY_DSN` (opt-in crash reporting), and
`VITE_BETA_FEEDBACK_URL`.

## Layout conventions

- `src/api/` — HTTP clients and zod schemas for the local FastAPI backend.
- `src/components/` — UI components; `workspace/` and `queue/` hold the sort flow.
- `src/features/` — feature modules (assistant chat/plan, codegen).
- `src/i18n/locales/{en,de,fr,it}/` — translations; parity is CI-enforced.
- `src/systemCommands/` — renderer side of the audited system-command catalog.
