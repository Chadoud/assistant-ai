# Windows setup — patch-only after first flutter create (matches setup.sh).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$Root = Split-Path $PSScriptRoot -Parent
$FlutterCmd = Join-Path $Root "scripts\mobile-flutter.sh"
# Git Bash shim on Windows dev machines; fallback to flutter on PATH.
function Invoke-Flutter {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  if (Test-Path $FlutterCmd) {
    & bash $FlutterCmd @Args
  } elseif (Get-Command flutter -ErrorAction SilentlyContinue) {
    & flutter @Args
  } else {
    throw "Flutter SDK not found. Install from https://docs.flutter.dev/get-started/install"
  }
}

if (-not (Test-Path ios) -or -not (Test-Path android)) {
  Write-Host "Generating ios/ and android/ (first-time only)…"
  Invoke-Flutter create . --org com.exosites --platforms=ios,android --project-name exosites_mobile
}

Invoke-Flutter pub get

$infoPlist = Join-Path $PSScriptRoot "ios\Runner\Info.plist"
if (Test-Path $infoPlist) {
  $xml = Get-Content $infoPlist -Raw
  if ($xml -notmatch "NSCameraUsageDescription") {
    $insert = @"
	<key>NSCameraUsageDescription</key>
	<string>Exo uses the camera to scan the desktop pairing QR code.</string>
"@
    $xml = $xml -replace "</dict>\s*</plist>", "$insert`n</dict>`n</plist>"
    Set-Content -Path $infoPlist -Value $xml -Encoding UTF8
    Write-Host "Patched NSCameraUsageDescription"
  }
  # Exact scheme string in CFBundleURLSchemes — not CFBundleName exosites_mobile.
  $xml = Get-Content $infoPlist -Raw
  if ($xml -notmatch "<string>exosites</string>") {
    $urlTypes = @"
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>exosites</string>
			</array>
		</dict>
	</array>
"@
    $xml = $xml -replace "</dict>\s*</plist>", "$urlTypes`n</dict>`n</plist>"
    Set-Content -Path $infoPlist -Value $xml -Encoding UTF8
    Write-Host "Patched iOS URL scheme exosites://"
  }
}

$manifest = Join-Path $PSScriptRoot "android\app\src\main\AndroidManifest.xml"
if ((Test-Path $manifest) -and ((Get-Content $manifest -Raw) -notmatch 'android:host="oauth"')) {
  $py = @"
from pathlib import Path
import re
p = Path(r'android/app/src/main/AndroidManifest.xml')
text = p.read_text(encoding='utf-8')
if 'android:host="oauth"' in text:
    raise SystemExit(0)
intent = '''
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="exosites" android:host="oauth" />
            </intent-filter>'''
pattern = re.compile(
    r'(<activity\b[^>]*android:name="\.MainActivity"[^>]*>)(.*?)(</activity>)',
    re.DOTALL,
)
m = pattern.search(text)
if not m:
    raise SystemExit('MainActivity not found')
text = text[: m.start(3)] + intent + '\n        ' + text[m.start(3) :]
p.write_text(text, encoding='utf-8')
print('Patched Android OAuth deep link')
"@
  $py | python -
}

Write-Host "Mobile setup complete. Run: flutter run -d android"
