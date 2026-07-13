# Release notes template (GitHub Release)

Copy into the GitHub release description when publishing `vX.Y.Z`.

## Exo `vX.Y.Z`

### Requirements

- **Windows** x64 or **macOS** (Intel or Apple Silicon — universal `.dmg`).
- **Exo account** (email or Google/Apple sign-in) for a **14-day free trial** — no credit card.
- **Ollama** installed and running; pull the model you use from **Settings → AI models** if prompted.
- Optional: **Tesseract** for OCR (see in-app **System & diagnostics**).

### What to test

- First launch → sign-in → trial countdown in Settings.
- Drop folder → review → apply; undo from History.
- **Help → Copy diagnostics** if something breaks (no folder paths in the clipboard payload).

### Privacy & data

- Policies: [Privacy](https://exosites.ch/eng/app-privacy) · [Terms](https://exosites.ch/eng/app-terms)
- **Usage analytics** and **crash reports** are **on by default** (covered by Terms/Privacy acceptance). Opt out under **Settings → Privacy & diagnostics**.

### Report issues

- **Link:** `YOUR_FORM_OR_DISCORD_OR_DISCUSSIONS_URL`
- Or **Settings → Send feedback** (when the local API is running).

### Known issues

- (Unsigned builds: Windows SmartScreen / macOS Gatekeeper may warn — use “More info” / right-click Open.)
- (Add bullets.)

### Assets

- Attach `Exo Setup.exe` / `.dmg` from CI or local `npm run package:win` / `package:mac`.
