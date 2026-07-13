#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
FLUTTER="$ROOT/scripts/mobile-flutter.sh"

if ! [[ -x "$FLUTTER" ]]; then
  chmod +x "$FLUTTER"
fi

# First-time: generate platform projects if missing.
if [[ ! -d ios || ! -d android ]]; then
  echo "Generating ios/ and android/ (first-time only)…"
  "$FLUTTER" create . --org com.exosites --platforms=ios,android --project-name exosites_mobile
fi

"$FLUTTER" pub get

INFO_PLIST="ios/Runner/Info.plist"
if [[ -f "$INFO_PLIST" ]] && ! grep -q NSMicrophoneUsageDescription "$INFO_PLIST"; then
  /usr/libexec/PlistBuddy -c "Add :NSMicrophoneUsageDescription string Exo uses the microphone for voice capture and meeting notes." "$INFO_PLIST" 2>/dev/null || true
  echo "Patched NSMicrophoneUsageDescription"
fi

if [[ -f "$INFO_PLIST" ]] && ! grep -q "exosites" "$INFO_PLIST"; then
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$INFO_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$INFO_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$INFO_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string exosites" "$INFO_PLIST" 2>/dev/null || true
  echo "Patched iOS URL scheme exosites://"
fi

MANIFEST="android/app/src/main/AndroidManifest.xml"
if [[ -f "$MANIFEST" ]] && ! grep -q RECORD_AUDIO "$MANIFEST"; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' 's|<manifest|<manifest xmlns:tools="http://schemas.android.com/tools"|' "$MANIFEST"
    sed -i '' 's|<application|    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <application|' "$MANIFEST"
  else
    sed -i 's|<manifest|<manifest xmlns:tools="http://schemas.android.com/tools"|' "$MANIFEST"
    sed -i 's|<application|    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <application|' "$MANIFEST"
  fi
  echo "Patched RECORD_AUDIO"
fi

if [[ -f "$MANIFEST" ]] && ! grep -q 'android:host="oauth"' "$MANIFEST"; then
  python3 - <<'PY' || true
from pathlib import Path
p = Path("android/app/src/main/AndroidManifest.xml")
text = p.read_text()
if 'android:host="oauth"' in text:
    raise SystemExit(0)
needle = '<activity android:name=".MainActivity"'
if needle not in text:
    raise SystemExit(0)
intent = '''
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="exosites" android:host="oauth" />
            </intent-filter>'''
text = text.replace(needle, needle + intent, 1)
p.write_text(text)
print("Patched Android OAuth deep link")
PY
fi

if [[ -f pubspec.yaml ]] && grep -q flutter_launcher_icons pubspec.yaml; then
  echo "Generating app icons and splash…"
  "$FLUTTER" pub run flutter_launcher_icons 2>/dev/null || "$FLUTTER" pub run flutter_launcher_icons:main
  "$FLUTTER" pub run flutter_native_splash:create 2>/dev/null || true
fi

echo "Mobile setup complete. Run: npm run mobile:run:ios"
