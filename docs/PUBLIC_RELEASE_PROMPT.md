# Prompt: Public Release Readiness — EXO

> Feed this prompt to a senior engineer or AI agent to produce and execute a
> concrete plan that takes the project from "strong beta" to "professional,
> publicly deliverable product". It encodes the findings of the June 2026
> release-readiness audit with file-level evidence.

---

## Role

You are the **release engineering and product-quality lead** for Exosites AI
Manager — a local-first desktop app (Electron + React/Vite frontend + Python
FastAPI backend, Ollama/Gemini AI) whose north star is: *every file lands in
the right folder without the user doing the work*.

Your mandate: make the project **publicly deliverable** — a stranger must be
able to discover the repo, download an installer, complete first-run setup,
and successfully sort files, with no broken promises in legal, privacy, or
documentation. You ship like a company whose reputation rides on this release.

## Hard constraints

1. **Never break existing features.** Windows behavior is the reference;
   every change must keep `npm run lint`, `npm run test`, `npm run test:electron`,
   and `cd backend && python -m pytest -q` green.
2. **No synthetic progress.** Numeric progress only when numerator and
   denominator are ground truth (workspace rule `progress-and-loading.mdc`).
3. **Privacy promises must match code.** If docs say default-on diagnostics, Terms/Privacy must disclose it and Settings must offer opt-out.
4. **Plain language in UI.** No ML jargon, no raw exception text to end users.
5. Work in priority order (P0 → P3). Within each item: implement → verify →
   mark complete. Do not start P2 while a P0 is open.

---

## P0 — Ship blockers (release is impossible or dishonest without these)

### P0.1 Make CI green on master
The last 3 runs of `Build Installers` failed in the `quality` job at
**`npm run check:unused:strict`** (knip strict + vulture strict), so the
Windows/macOS installer jobs never run. Resolve the strict-unused debt
properly: delete genuinely dead exports/files (verify each with grep +
tests), wire or delete orphans (see P2.3), and add knip ignore entries
**only** for proven false positives (e.g. runtime-loaded worklets like
`voice-capture-processor.js`), each with a one-line justification comment.
Acceptance: `gh run list` shows the full pipeline green including both
installer jobs producing artifacts.

### P0.2 Align telemetry/crash-report defaults with documented policy

**Resolved (2026-06-19):** Desktop defaults are **on** after Terms/Privacy acceptance, disclosed in legal copy; opt-out in **Settings → Privacy & diagnostics**. Docs, `SECURITY.md`, welcome step, and `LEGAL_TERMS_BUNDLE_VERSION` aligned. Mobile remains opt-in.

- `frontend/src/settings/appSettingsHydration.ts` — default `telemetryOptIn` / `crashReportsOptIn` true; `diagnosticsOptOutExplicit` tracks explicit opt-out across legal re-accept
- `frontend/src/utils/diagnosticsPreferences.ts` — shared patch + legal-accept helper
- `docs/runbooks/legal-publish.md` — publish exosites-agency `appPrivacy.ts` / `appTerms.ts` before release

Acceptance: fresh profile sends telemetry/crash after Terms accept unless user opted out; Settings toggle persists; re-accept after legal bump respects prior opt-out.

### P0.3 LICENSE file (done)
Root `LICENSE` is **PolyForm Noncommercial 1.0.0** (noncommercial use only;
commercial use requires a separate agreement with Exosites). `package.json`
declares `PolyForm-Noncommercial-1.0.0`; README links to `LICENSE`.

### P0.4 Publish real Privacy Policy & Terms
`docs/POLICY_AND_TERMS_DRAFT.md` is explicitly a draft with `[BRACKETED]`
placeholders. Finalize the text (flag any items that need actual legal
counsel), host it (exosites.ch URLs per `frontend/.env.example:10-11`), and
ensure production builds bake `VITE_PRIVACY_POLICY_URL` / `VITE_TERMS_URL`
via CI. In-app links must resolve for packaged builds.

### P0.5 Versioning and changelog
Everything is frozen at 1.0.0 (`package.json:3`, `frontend/src/appVersion.ts:2`,
`installer.iss:2`). Decide a real first public version (recommend `0.9.0` for
public beta or `1.0.0` only if P0–P1 are all done), bump it in **one** source
of truth synced to all consumers, create `CHANGELOG.md` (Keep-a-Changelog
format) seeded from git history highlights, and make the tag-based release
flow (`v*` → GitHub Release) produce notes from it.

---

## P1 — Trust and first-impression (users will hit these in the first 10 minutes)

### P1.1 First-run must not dead-end
`useWelcomeFlow.ts:75-82` lets users skip setup with no model configured and
land in the app where sorting silently can't work. Keep skip available, but
the main workspace must show a persistent, friendly "Finish setup — choose
your AI model" call-to-action that deep-links back to the wizard step.
Acceptance: a fresh install with skip-everything still leads the user to a
working sort within two clicks.

### P1.2 Remove synthetic install progress
`electron/setup/runSetup.js:389-396` pulses `installPct += 1` on a timer when
the Ollama installer emits no `%`. Replace with an honest indeterminate state
("Installing Ollama…") and keep numeric progress only for the model pull
(which streams real bytes). This is a workspace hard rule.

### P1.3 End-user documentation pass
- Rewrite `README.md` top section user-first: what it does, screenshots/GIF,
  download links, 3-step quickstart, system requirements (Windows/macOS,
  ~500 MB app + ~4 GB model), then a separate "Development" section.
- Replace `frontend/README.md` (still Vite template boilerplate).
- Fix `docs/DISTRIBUTION.md:9` — auto-update IS wired (`electron/autoUpdater.js`).
- Add `docs/INSTALL.md` with per-OS install + Gatekeeper/SmartScreen guidance.

### P1.4 Code signing strategy
Unsigned builds hit SmartScreen/Gatekeeper walls. CI already supports
`WIN_CSC_LINK` / `MAC_CSC_LINK` + notarization conditionally. Document the
exact certificate purchase/setup steps for the owner in `docs/DISTRIBUTION.md`,
and until certs exist, add honest "unsigned build" warnings to README and the
release notes template. Flag cert acquisition as an owner action item.

### P1.5 User-facing error hygiene
- `useGlobalErrorToasts.ts:59-72` can surface raw `ev.message` (up to 300
  chars) — route through `userGuidance.ts` mapping with a generic friendly
  fallback ("Something went wrong — view details").
- Localize hardcoded English error/UI strings: `ErrorBoundary.tsx:77,92`,
  `WelcomeScreen.tsx:290,568,577,609-613` (Skip/Back/step counter/unsaved
  dialog), `HelpShortcutsModal.tsx:97-130`, `SettingsPanel.tsx:242-311`
  group labels, `ReassignModal.tsx:102`. Add the keys to all four locales
  (en/de/fr/it) — locale-parity CI will enforce.

---

## P2 — Professional polish (quality signals a public repo is judged by)

### P2.1 Branding consistency
One product name everywhere. Currently: "EXO" (installers,
`package.json:38`), "AI Manager" (`electron/constants.js:5`,
`frontend/src/constants.ts:104`), `exosites-assistant` (npm name),
`ai-file-sorter` (repo), `Exosites-File-Manager-*` (CI artifacts). Pick the
canonical name, align in-app shell name and CI artifact names; document that
repo/npm renames are owner decisions (breaking the updater feed — coordinate
with `package.json build.publish` if the repo is renamed).

### P2.2 E2E test for the core value prop
No Playwright spec covers classify → review → apply. Add one E2E (mock the
classifier at the backend boundary or use a fixture model response) that:
drops fixture files into a temp source dir, runs sort, asserts the plan
renders, applies it, and verifies files moved. This is the single most
valuable automated test the project can have.

### P2.3 Dead code and strays
- `frontend/src/components/VisualContextButton.tsx` — orphaned (never
  imported). Decide: wire it into the chat input (it has working consent
  plumbing) or delete it and its preload/IPC surface remains for the consent
  gate. Deleting is acceptable; half-shipped is not.
- `chat-app/index.html` — unrelated "Pulse Assistant" demo at repo root with
  foreign branding. Delete it (or move to a clearly-marked `examples/` with a
  README line if the owner wants to keep it).
- Re-run knip/vulture after P0.1 and keep the strict gate green.

### P2.4 Footprint honesty
The PyInstaller backend bundles playwright + pyautogui + mss
(`backend/requirements.txt:21-24`) — heavyweight desktop-automation deps that
core file-sorting never touches. Evaluate making them lazy/optional extras
(import-on-demand already exists in actions; the win is excluding them from
the binary if feasible, or documenting why not). Publish expected install
size and first-run download (~4 GB model) in README and the wizard.

---

## P3 — Nice-to-have before GA

- Brightness/reminder tools: implement macOS variants or remove from the
  mac tool catalog (`backend/actions/computer_settings.py:32-36`,
  `reminder.py:63-98` — no launchd scheduling).
- Rotate scraping User-Agent per platform (`youtube_video.py:187`).
- Comment/docstring cleanups: "backend.exe"-centric wording in
  `backend/server.py:2`, `dotenv_bootstrap.py:6,74`; Windows-only path
  examples in `voice_instructions.py:393`.
- Add a startup-time and bundle-size budget to `docs/QUALITY_GATES.md`
  (renderer chunk is already >1.6 MB minified).

---

## Verification protocol (run after every workstream)

```
npm run lint                      # frontend ESLint
cd frontend && npm run check-locale-keys
npm run check:unused:strict       # must stay green after P0.1
npm run build:frontend
npm run test                      # vitest + electron node:test
cd backend && python -m pytest -q
```

Final acceptance for "public-ready":
1. `gh run list` — full pipeline green, Windows + macOS artifacts uploaded.
2. Fresh-profile manual test: install → wizard → sort 10 mixed files →
   correct folders, no console errors, no English strings in a non-English
   locale on the main paths.
3. Zero network calls before telemetry opt-in (verify with devtools/proxy).
4. README renders as a product page; LICENSE present; legal links resolve.
5. A tagged `v*` push produces a GitHub Release with installers and notes.

## Deliverable format

First produce a plan with one todo per P-item above (keep IDs like `P0.1`).
Then implement in order, marking each in_progress → completed. Anything
requiring an owner decision (license choice, certificates, repo rename,
legal counsel) must be implemented as far as possible and then surfaced in a
final "Owner action items" list — do not silently skip it.
