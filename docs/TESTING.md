# Testing policy

- **Unit (frontend):** `cd frontend && npm test` — Vitest; run after changing hooks, queue batch logic, or i18n keys (`npm run check-locale-keys` when strings change).
- **Unit (Electron main):** `npm run test:electron` from repo root — IPC manifest validation plus `node:test` files under `electron/`.
- **Backend:** `cd backend && python -m pytest -q`.
- **E2E (Playwright):** `cd frontend && npm run test:e2e` — use `gotoSeededApp` from `e2e/helpers/appReady.ts` (localStorage + `sessionStorage` `__exositesDevScenario=e2e` + optional `window.electronAPI` stub) so the launch sphere and welcome wizard do not block, and the **Run sort** control mounts like the desktop build. In dev, `applyDevScenarioFromUrlOrEnv` no longer clears the e2e session when the URL has no `devScenario` param. CI may run a subset; full `quality` from root includes e2e when configured.

- **Release gate (all layers):** `npm run quality` from repo root — lint, build, frontend Vitest, Electron tests, backend pytest, Playwright e2e. Root `npm test` runs frontend + Electron only (not backend).

**Last updated:** 2026-06-16
