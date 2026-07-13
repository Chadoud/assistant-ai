# Installing EXO

Download the installer for your platform from
[GitHub Releases](https://github.com/Chadoud/ai-file-sorter/releases).

> **Heads-up:** installers are currently **unsigned**, so Windows and macOS show a
> one-time security warning. The steps below get you past it. The app installs
> per-user and does not require admin rights.

## What to expect

- App download: a few hundred MB; installed size ~500 MB.
- **Sign in** with your Exo account — **cloud sorting** does not require installing
  Ollama or configuring a sort API key.
- Optional during setup or later in Settings:
  - **Tesseract OCR** for scanned documents (~50 MB).
  - **Local vision model** for difficult scans (Settings → AI models → Photos & scans).
  - **Cloud API key** for chat/voice (Gemini, OpenAI, or Anthropic) — separate from sort.

Contributors running a **local-only** dev build may still use Ollama for sort; see the
root [README.md](../README.md) Development section.

## Windows 10 / 11

1. Download **`EXO Setup.exe`**.
2. Run it. If **SmartScreen** shows “Windows protected your PC”:
   - Click **More info** → **Run anyway**.
3. Follow the installer, then launch from the Start menu.
4. Sign in when prompted. Optional setup steps (OCR, etc.) can be skipped and
   finished later from Settings.

## macOS 12+ (Apple Silicon and Intel — one universal download)

1. Download **`EXO.dmg`** and drag the app to **Applications**.
2. First launch on an unsigned build:
   - **Right-click → Open → Open**, or
   - **System Settings → Privacy & Security → Open Anyway**.
3. Grant permissions when you use matching features (microphone, screen recording,
   accessibility for assistant tools).

More: [MACOS.md](MACOS.md).

## After install

1. **Sign in** and choose an **output folder** for sorted files.
2. Drop files onto the **Sort** tab.
3. Review proposed folders — each file has a one-line reason — then **Apply**.
   Use **History** to undo.

Explore **Memories**, **Tasks**, and **Assistant** for the second-brain features.

## Uninstalling

- **Windows:** Settings → Apps → EXO → Uninstall.
- **macOS:** delete the app from Applications.
- Optional local models (vision, Whisper, Ollama if you installed it for dev) remain
  in their own tool directories until you remove them manually.
