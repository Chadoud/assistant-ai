# Dead code triage (baseline)

Generated during the dead-code cleanup pass. Re-run tooling after large refactors.

## Tooling

| Tool | Command | Scope |
|------|---------|--------|
| Knip (fast) | `cd frontend && npm run check:unused` | Unused **files** and **dependencies** only (`knip --include files,dependencies`). |
| Knip (strict) | `cd frontend && npm run check:unused:strict` or from root `npm run check:unused:strict` | Full Knip: unused exports and types as well. Config: `frontend/knip.json` (Vite + Vitest + Playwright helper entry). **Knip v6** does not support `ignoreExports` in JSON; use `ignore` paths for deliberate carve-outs (e.g. `src/systemCommands/**`, global `.d.ts` shims). |
| Vulture (fast) | `npm run check:unused:backend` (repo root) | `min-confidence` 100, `tests` excluded, for a quick signal. |
| Vulture (strict) | `npm run check:unused:backend:strict` (repo root) | Reads `[tool.vulture]` in `backend/pyproject.toml` (includes tests, `min_confidence` 80, `ignore_names = ["cls"]` for Pydantic `@field_validator`). |

Root `npm run check:unused:strict` runs frontend strict Knip then backend strict Vulture. The `quality` npm script includes strict unused checks after lint.

### Frontend triage rules

- Prefer **de-exporting** (`interface` / `type` without `export`) for component-only prop types and removing **barrel re-exports** that nothing imports.
- Prefer **deleting** truly dead symbols over widening `ignore`.
- Remove **unused exported types** entirely when nothing references them (e.g. a type declared only for documentation).

## Frontend — removed or refactored (this pass)

| Path | Action | Notes |
|------|--------|--------|
| `src/utils/workspacePaths.ts` | **Deleted** | No imports. |
| `src/components/PrerequisiteNoticeDialog.tsx` | **Deleted** | Orphan component. |
| `src/components/FolderUploadModal.tsx` | **Deleted** | Superseded by current workspace/DropZone flows. |
| `src/api/chat.ts` | **Deleted** | Empty placeholder. |
| `src/telemetry/index.ts` | **Deleted** | Barrel unused; callers import `telemetry/client` etc. |
| `src/utils/apiStatus.ts` | **Deleted** | Duplicate/unused status copy. |
| `src/utils/donutLegendColumns.ts` | **Deleted** | Unused. |
| `src/utils/webDirectoryPicker.ts` | **Deleted** | Unused File System Access helper. |
| `src/systemCommands/executorTypes.ts` | **Deleted** | Doc-only stub; superseded by catalog + main mirror. |
| `src/components/ui/ModelInstallProgress.tsx` | **Deleted** | Default export unused; `formatInstallPhase` moved to `src/utils/modelInstallPhase.ts`. |
| `src/types/file-system-access.d.ts` | **Kept** | Global augmentation for `showDirectoryPicker`; Knip-ignored. |
| `src/systemCommands/*` (remaining) | **Kept** | Allowlist + parser + tests; not wired from chat UI yet — see `docs/AI_SYSTEM_COMMANDS.md`. |

## Backend — this pass

| Item | Action |
|------|--------|
| `telemetry/public_routes.py` | **Mounted** in `main.py` as `/v1/public/client-config`; smoke test in `tests/test_api_routes_smoke.py`. |

## Renderer audit hook

| Item | Action |
|------|--------|
| `systemCommands/audit.ts` | **Kept**; `useSystemCommandDelegate` calls `auditSystemCommand` for unknown delegate IDs and invalid `navigate_tab` args. |

## i18n

Removed orphan `settings.aiSystemCommands*` and `settings.aiActionToast*` keys from `en`, `de`, `fr`, `it` (no UI referenced them).

## Repo hygiene pass (2026-06)

| Path | Action | Notes |
|------|--------|--------|
| `frontend/coverage/` (~470 files) | **Removed from git + gitignored** | CI artifact only; should never be committed. |
| `.DS_Store` | **Removed + gitignored** | macOS junk. |
| `cloud/` (legacy Python stack) | **Deleted** | Superseded by `cloud-node/`; not in CI or deploy. |
| `docs/BETA.md` | **Deleted** | Superseded by `BETA_RELEASE.md`; broken links to removed `cloud/`. |
| `scripts/fix-unused-exports.cjs` | **Deleted** | One-shot Knip codemod; not wired in npm scripts. |
| `scripts/phase0-deploy-and-verify.sh` | **Deleted** | Use `VERIFY_AFTER_DEPLOY=1 ./scripts/deploy-cloud-api.sh` instead. |
| `frontend/src/components/settings/SettingsSortInstructionsSection.tsx` | **Deleted** | Superseded by `SortInstructionsSettingsContent`. |
| `frontend/src/integrations/electronIntegrationClient.ts` | **Deleted** | Never imported; `desktopClient` is the integration surface. |
| `backend/scripts/benchmark_*.py` | **Deleted** | Ad-hoc dev benchmarks, not referenced in CI or docs workflow. |
