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
  if ($xml -notmatch "NSMicrophoneUsageDescription") {
    $insert = @"
	<key>NSMicrophoneUsageDescription</key>
	<string>Exo uses the microphone for voice capture and meeting notes.</string>
"@
    $xml = $xml -replace "</dict>\s*</plist>", "$insert`n</dict>`n</plist>"
    Set-Content -Path $infoPlist -Value $xml -Encoding UTF8
    Write-Host "Patched NSMicrophoneUsageDescription"
  }
  if ($xml -notmatch "exosites") {
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
if (Test-Path $manifest) {
  $m = Get-Content $manifest -Raw
  if ($m -notmatch "RECORD_AUDIO") {
    if ($m -notmatch 'xmlns:tools') {
      $m = $m -replace "<manifest", '<manifest xmlns:tools="http://schemas.android.com/tools"'
    }
    $perm = '    <uses-permission android:name="android.permission.RECORD_AUDIO" />'
    $m = $m -replace "(<application)", "$perm`n`$1"
    Set-Content -Path $manifest -Value $m -Encoding UTF8
    Write-Host "Patched RECORD_AUDIO"
  }
  if ($m -notmatch 'android:host="oauth"') {
    $intent = @'
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="exosites" android:host="oauth" />
            </intent-filter>
'@
    $m = $m -replace '(<activity android:name="\.MainActivity")', "`$1`n$intent"
    Set-Content -Path $manifest -Value $m -Encoding UTF8
    Write-Host "Patched Android OAuth deep link"
  }
}

Write-Host "Mobile setup complete. Run: flutter run -d android"
