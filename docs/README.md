# Documentation index

Start here for architecture, contributor workflows, and release context.

| Order | Document | Purpose |
|------|----------|---------|
| 1 | [ARCHITECTURE.md](ARCHITECTURE.md) | Request flow, env, ports, tests, `create_app` vs `main.app` |
| 2 | [STRUCTURAL_AUDIT.md](STRUCTURAL_AUDIT.md) | Inventory, IPC surface, large-file hot spots, test gaps, refactor backlog |
| 3 | [DEAD_CODE_TRIAGE.md](DEAD_CODE_TRIAGE.md) | Knip, Vulture, how to triage unused code |
| 4 | [INTEGRATIONS.md](INTEGRATIONS.md) | Third-party OAuth (Google, Microsoft), IPC table |
| 5 | [SECURITY.md](../SECURITY.md) | Privacy, OAuth, telemetry, data handling (repo root) |
| 6 | [DISTRIBUTION.md](DISTRIBUTION.md) | Packaging and distribution |
| 7 | [MACOS.md](MACOS.md) | macOS install and troubleshooting |
| 8 | [BETA_RELEASE.md](BETA_RELEASE.md) | Product release checklist |
| 9 | [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | **Tests · observability · PII** — phased backlog, release gates, definition of done |
| 10 | [TESTING.md](TESTING.md) | What to run: Vitest, pytest, Playwright, Electron node:test |
| 11 | [../CONTRIBUTING.md](../CONTRIBUTING.md) | Pre-PR / release commands, i18n and tour parity, policy doc when changing gates |

**Product and accuracy**

- [PRODUCT_VISION.md](PRODUCT_VISION.md) — product intent.
- [SORT_INTELLIGENCE_ROADMAP.md](SORT_INTELLIGENCE_ROADMAP.md) — **active** sort accuracy architecture (signal library → extraction → batch reconcile).
- [I18N.md](I18N.md) — translation workflow; run `npm run check-locale-keys` in `frontend/` after key changes.
- [accuracy-*.md](.) — classification / eval playbooks (see file list in repo).

**Optional quality gate list:** [QUALITY_GATES.md](QUALITY_GATES.md).  
**Local pre-push / pre-tag gates:** [runbooks/pre-push-verification.md](runbooks/pre-push-verification.md).

**Video sorting (backend)** — **ffmpeg** / **ffprobe**: on `PATH`, or explicit paths in `backend/.env` (`EXOSITES_FFMPEG_PATH`, `EXOSITES_FFPROBE_PATH`), or an unpacked build under `tools/ffmpeg/<build>/bin` (commonly gitignored; backend may auto-detect). In the UI, **Settings → Connection check** lists what the process resolved. Optional STT: `pip install -r backend/requirements-video.txt` and `EXOSITES_VIDEO_STT_ENABLE=1`. `GET /meta/video` (same host/port as the API) is for diagnostics. All knobs: [`backend/.env.example`](../backend/.env.example) and the troubleshooting table in [root `README.md`](../README.md).
