# EXO

**Every file lands in the right folder — without you doing the work.**

<p align="center">
  <img src="docs/media/assistant.gif" alt="Exo — assistant, chat, and voice" width="860" />
</p>

EXO is a local-first desktop app for **AI file sorting**, a **second brain** (memories, tasks, conversations), and an **assistant** with chat and voice. Drop a messy pile of PDFs, scans, photos, and spreadsheets; review each proposed folder with a plain-language reason; apply in bulk — and undo anything.

**Your files stay on your machine.** Classification for sorting runs on **Exo cloud infrastructure** when you sign in (no local LLM or API key required for sort). Optional local tools handle OCR, scans, and offline speech.

Connectors: Gmail, Google Drive, OneDrive, Outlook, Dropbox, Notion, Infomaniak, WhatsApp, and more.

## Preview

| Smart sort | Memory map | External sources |
|:---:|:---:|:---:|
| <img src="docs/media/smart-sort.jpg" alt="Smart sort — classify and route files" width="280" /> | <img src="docs/media/memory-map.gif" alt="Memory map — files, memories, conversations" width="280" /> | <img src="docs/media/external-sources.jpg" alt="External sources — Gmail, Drive, Dropbox, and more" width="280" /> |

## Download

| Platform | File |
|----------|------|
| **Windows** (x64) | `EXO Setup.exe` — [exosites.ch](https://exosites.ch/downloads/ai-file-manager/) or [Releases](https://github.com/Chadoud/assistant-ai/releases) |
| **macOS** (Intel + Apple Silicon, one universal download) | `EXO.dmg` — [exosites.ch](https://exosites.ch/downloads/ai-file-manager/) or [Releases](https://github.com/Chadoud/assistant-ai/releases) |

> **Note:** installers are currently **unsigned** — Windows SmartScreen and macOS Gatekeeper will warn on first launch. See [docs/INSTALL.md](docs/INSTALL.md) and [docs/MACOS.md](docs/MACOS.md).

### Quickstart (subscribers)

1. **Install and launch** the desktop app (~500 MB installed).
2. **Sign in** with your Exo account. Sorting uses Exo’s cloud AI — you do not install Ollama or paste a sort API key.
3. **Choose an output folder**, drop files on the **Sort** tab, review reasons, **Apply**. Use **History** to undo.

Optional first-run steps (not required for cloud sort):

- **Tesseract OCR** — better text from scanned PDFs/images (setup wizard or Settings).
- **Vision model** — local model for difficult scans (**Settings → AI models → Photos & scans**).
- **Chat / voice** — add a [Gemini / OpenAI / Anthropic] API key in Settings if you want cloud assistant features beyond sort.

### How processing works

| What | Where it runs |
|------|----------------|
| **File storage & moves** | Your computer (output folder you choose) |
| **Sort / classify (LLM)** | **Exo cloud** after sign-in (managed credentials) |
| **Chat & agent planning** | Your configured cloud provider (API key) |
| **OCR (Tesseract)** | Local (optional) |
| **Vision for scans** | Local Ollama model (optional) |
| **Memory search embeddings** | Optional local Ollama; lexical search always works offline |

Developers can run **local Ollama** for sort instead of cloud — see [Development](#development) below.

### System requirements

- **Windows 10/11 (x64)** or **macOS 12+** (Apple Silicon or Intel).
- Disk: ~500 MB for the app; optional **local** add-ons (vision model ~1–4 GB, Whisper for offline speech, Tesseract ~50 MB).
- RAM: 8 GB minimum; 16 GB recommended if you use local vision models or large batches.
- Network: required for **sign-in** and **cloud sort** (production path).

### Privacy

- **Files** are read and moved on your device. Sort sends **document text** (not necessarily whole files) to Exo’s LLM gateway for classification when you use cloud sort.
- **Chat** uses whichever cloud provider you configure; that traffic goes to that provider.
- Usage analytics and crash reports are **on by default** (disclosed in [Terms](https://exosites.ch/eng/app-terms) and [Privacy](https://exosites.ch/eng/app-privacy)); opt out under **Settings → Privacy & diagnostics**. See [SECURITY.md](SECURITY.md).

### Troubleshooting

| Issue | What to try |
|-------|-------------|
| **Sort unavailable / not signed in** | Sign in under **Settings → Account**. Cloud sort needs a valid subscription and network access to Exo APIs. |
| **Offline / API not reachable** | Ensure the Python backend started (use **Retry** on the status pill). Check local API port `7799` is not blocked. |
| **Cloud sort errors (401 / 503)** | Sign out and sign in again to refresh sort credentials. See [docs/SAAS_SORT_UX_PLAN.md](docs/SAAS_SORT_UX_PLAN.md) for ops context. |
| **OCR / scans** | Install Tesseract (Windows: setup wizard; Mac: setup or `brew install tesseract`). Vision fallback for hard scans runs on **Exo cloud servers** when signed in. |
| **Support bundle** | **Help → Copy diagnostics** (**F1** or **Ctrl+Shift+/**) — versions and connectivity, no folder paths. |
| **Offline speech (optional)** | **Settings → Voice control** → **Prepare offline model** (Whisper weights, local CPU/GPU). |
| **Video sorting** | Backend needs **ffmpeg** / **ffprobe** on `PATH` or in `backend/.env` — see `backend/.env.example` and **Settings → Connection check**. |

More: [`docs/README.md`](docs/README.md), [`docs/INSTALL.md`](docs/INSTALL.md), [`SECURITY.md`](SECURITY.md), [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md).

---

## Development

### Running in development mode

**Windows**

```powershell
.\start-dev.ps1
```

**macOS**

```bash
chmod +x start-dev.sh
./start-dev.sh
```

This starts the FastAPI backend (`7799`), Vite (`5173`), and Electron. Sort/classify LLM calls use the **Exo VPS** by default — see [`docs/CLOUD_LLM_ONLY.md`](docs/CLOUD_LLM_ONLY.md). Copy `backend/.env.example` to `backend/.env` and set a staging API key or sign in for managed credentials.

```bash
# backend/.env (minimum for dev without sign-in)
OLLAMA_MODE=remote
EXOSITES_REMOTE_LLM=1
OLLAMA_HOST=https://llm-staging.exosites.ch
OLLAMA_API_KEY=<staging virtual key from ops>
```

Local `ollama serve` is **not** used for sort (`OLLAMA_MODE=local` is pytest-only).

### Browser-only (same UI, no Electron)

1. Backend: `cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 7799`
2. Frontend: `cd frontend && npm run dev`
3. Open `http://127.0.0.1:5173` — **Drop files** uses multipart upload (local folder paths are desktop-only).

Set `VITE_API_BASE` in `frontend/.env` if the API is not on `127.0.0.1:7799`, and add that origin to `connect-src` in `frontend/index.html`.

### Building installers

- **CI:** [`.github/workflows/build.yml`](.github/workflows/build.yml); tag `v*` publishes a GitHub release from [CHANGELOG.md](CHANGELOG.md).
- **macOS DMG:** `npm run build:mac` → `dist-installer/EXO.dmg`
- Signing / auto-update: [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)

### Quality gates

- [CONTRIBUTING.md](CONTRIBUTING.md), [docs/QUALITY_GATES.md](docs/QUALITY_GATES.md)
- Unused code: `npm run check:unused` (Knip + Vulture)
- Sort accuracy: [docs/classification-accuracy.md](docs/classification-accuracy.md)

### Project structure

Authoritative layout: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Module inventory: [`docs/STRUCTURAL_AUDIT.md`](docs/STRUCTURAL_AUDIT.md).

```
ai-file-sorter/
├── electron/           # Desktop shell, cloud auth, sort credential sync
├── frontend/           # React + Vite UI (sort, memories, assistant, settings)
├── backend/            # FastAPI — jobs, memory, integrations, agent
├── cloud-node/         # Exo account API + sort credential broker (deployed separately)
├── scripts/            # Packaging, GA smoke tests, deploy helpers
└── docs/               # Architecture, closed beta, SaaS sort UX plans
```

### Architecture (production)

```
Electron (main process)
  │  cloud auth + sort credentials → backend env overrides
  └── React UI (renderer)
        │  HTTP localhost:7799
        ▼
  Python FastAPI (JobService, memory, integrations, agent)
        │
        ├── ingestor          ← extract text locally (OCR, PDF, …)
        ├── classifier        ← LLM classify on Exo VPS (LiteLLM)
        └── sorter            ← move files locally
              │
              ▼
        Exo LLM gateway (HTTPS) — classify, embed, vision for signed-in subscribers
```

All sort inference models run on the VPS. See [`docs/CLOUD_LLM_ONLY.md`](docs/CLOUD_LLM_ONLY.md).

### Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| UI | React + Vite + Tailwind |
| Backend API | Python 3.11+, FastAPI, Uvicorn |
| Sort LLM | Exo cloud gateway (LiteLLM on VPS) — always remote |
| Chat / agent | User’s cloud provider (Gemini, OpenAI, Anthropic, …) |
| Memory | SQLite (`assistant_memory`, conversations, tasks) |
| File parsing | PyMuPDF, python-docx, pandas, Pillow, Tesseract |
| Packaging | PyInstaller, Inno Setup (Windows), electron-builder (macOS) |

## License

Source code is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE) © 2026 Exosites. You may use, modify, and share the code for **noncommercial** purposes only. **Commercial use** (including running a competing paid product or SaaS built from this source) requires a separate written agreement with Exosites — contact [exosites.ch](https://exosites.ch).
