# EXO - Development Launcher
# Run this script from the project root to start everything in dev mode.

$ErrorActionPreference = "SilentlyContinue"
$root = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "EXO - Dev Mode" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ── 1. Local Ollama (skipped — cloud LLM only; see docs/CLOUD_LLM_ONLY.md) ───
$localOllama = $false
$envPath = Join-Path $root "backend\.env"
if (Test-Path $envPath) {
    $envText = Get-Content $envPath -Raw
    if ($envText -match '(?m)^\s*OLLAMA_MODE=local') {
        $localOllama = $true
    }
}

if ($localOllama) {
    Write-Host "WARNING: OLLAMA_MODE=local — test-only; production uses Exo VPS (docs/CLOUD_LLM_ONLY.md)." -ForegroundColor Yellow
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Write-Host "`nOllama not found. Installing..." -ForegroundColor Yellow
        irm https://ollama.com/install.ps1 | iex
        Write-Host "Ollama installed. Re-run this script." -ForegroundColor Green
        exit 0
    }

    $ollamaRunning = (curl.exe -s --max-time 2 "http://localhost:11434/api/tags" 2>$null) -ne $null
    if (-not $ollamaRunning) {
        Write-Host "Starting Ollama..." -ForegroundColor Yellow
        Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 2
    }
    Write-Host "Ollama ready (local test mode)." -ForegroundColor Green
} else {
    Write-Host "Cloud LLM mode — skipping local Ollama install/serve." -ForegroundColor Green
}

# ── 1b. Check/install OCR (Tesseract) — always local ────────────────────────
if (-not (Get-Command tesseract -ErrorAction SilentlyContinue)) {
    Write-Host "Tesseract OCR not found." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "Attempting install via winget..." -ForegroundColor Yellow
        winget install --id UB-Mannheim.TesseractOCR -e --silent | Out-Null
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Host "Attempting install via choco..." -ForegroundColor Yellow
        choco install tesseract -y | Out-Null
    }
}
if (Get-Command tesseract -ErrorAction SilentlyContinue) {
    $ocrVer = tesseract --version 2>$null | Select-Object -First 1
    Write-Host "OCR ready: $ocrVer" -ForegroundColor Green
} else {
    Write-Host "OCR still missing; scanned files will use low-signal fallback." -ForegroundColor Yellow
}

# ── 2. Start Python backend (if needed) ───────────────────────────────────
$existingBackend = curl.exe -s --max-time 1 "http://127.0.0.1:7799/health" 2>$null
if ($existingBackend -match '"status"\s*:\s*"ok"') {
    Write-Host "`nBackend already running on port 7799." -ForegroundColor Green
} else {
    # ── 2a. Install / sync Python dependencies first ───────────────────────
    $backendDir = Join-Path $root "backend"
    $reqFile = Join-Path $backendDir "requirements.txt"
    if (Test-Path $reqFile) {
        Write-Host "`nInstalling/syncing Python dependencies..." -ForegroundColor Yellow
        $pipCmd = if (Get-Command py -ErrorAction SilentlyContinue) { "py -3" } elseif (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }
        $pipArgs = "-m pip install -r `"$reqFile`" --quiet --disable-pip-version-check"
        $pipResult = Invoke-Expression "$pipCmd $pipArgs" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "pip install had warnings/errors (non-fatal):" -ForegroundColor Yellow
            Write-Host $pipResult -ForegroundColor DarkYellow
        } else {
            Write-Host "Python dependencies OK." -ForegroundColor Green
        }
    }

    Write-Host "`nStarting Python backend on port 7799..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "$env:EXOSITES_DEV_BYPASS_ENTITLEMENT='1'; cd '$backendDir'; python -m uvicorn main:app --host 127.0.0.1 --port 7799 --reload"
    ) -WindowStyle Normal
}

# Wait for backend to be ready (use curl.exe — Invoke-WebRequest hangs here)
Write-Host "Waiting for backend..." -ForegroundColor DarkGray
$backendReady = $false
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 500
    $result = curl.exe -s --max-time 1 "http://127.0.0.1:7799/health" 2>$null
    if ($result -match '"status"\s*:\s*"ok"') {
        $backendReady = $true
        break
    }
}

if ($backendReady) {
    Write-Host "Backend is ready!" -ForegroundColor Green
} else {
    Write-Host "Backend not responding yet — proceeding anyway." -ForegroundColor Yellow
}

# ── 3. Start Vite frontend ────────────────────────────────────────────────
$existingVite = curl.exe -s --max-time 1 "http://localhost:5173" 2>$null
if ($existingVite) {
    Write-Host "`nVite already running on port 5173." -ForegroundColor Green
} else {
    Write-Host "`nStarting Vite frontend on port 5173..." -ForegroundColor Yellow
    $frontendDir = Join-Path $root "frontend"
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "cd '$frontendDir'; npm run dev"
    ) -WindowStyle Normal
}

# Wait for Vite to be ready
Write-Host "Waiting for Vite..." -ForegroundColor DarkGray
$viteReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    $result = curl.exe -s --max-time 1 "http://localhost:5173" 2>$null
    if ($result) {
        $viteReady = $true
        break
    }
}

if ($viteReady) {
    Write-Host "Vite is ready!" -ForegroundColor Green
} else {
    Write-Host "Vite not responding yet — proceeding anyway." -ForegroundColor Yellow
}

# ── 4. Launch Electron ────────────────────────────────────────────────────
Write-Host "`nLaunching Electron window..." -ForegroundColor Cyan
$env:NODE_ENV = "development"
$env:SKIP_BACKEND = "1"   # Tell Electron not to spawn its own backend
node (Join-Path $root "scripts/run-electron-dev.js")
