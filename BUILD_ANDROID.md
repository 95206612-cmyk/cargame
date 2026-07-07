# Street Racer — Android APK Build Guide

## Prerequisites

1. **Node.js** 18+ installed
2. **Java JDK 17** (required for Cordova Android 13)
3. **Android SDK** (API 34) — install via Android Studio or command line
4. **Gradle** 8+ (bundled with Cordova Android)

### Environment Variables

```bash
# Windows
set ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk
set JAVA_HOME=C:\Program Files\Java\jdk-17

# macOS / Linux
export ANDROID_HOME=~/Android/Sdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
```

---

## Step-by-Step Build

### 1. Build the web game

```bash
cd cargame
npm install
npm run build
```

This outputs to `dist/` — a self-contained web game.

### 2. Set up Cordova project

```bash
cd cordova
npm install
npx cordova platform add android
```

### 3. Copy web build into Cordova

```bash
# Windows
rmdir /s /q cordova\www
xcopy /e /i ..\dist cordova\www

# macOS / Linux
rm -rf cordova/www
cp -r ../dist cordova/www
```

### 4. Build debug APK (for testing)

```bash
cd cordova
npx cordova build android --debug
```

APK output: `cordova/platforms/android/app/build/outputs/apk/debug/app-debug.apk`

### 5. Build release APK (for distribution)

First, generate a keystore:

```bash
keytool -genkey -v -keystore cargame.keystore -alias cargame -keyalg RSA -keysize 2048 -validity 10000
```

Then create `cordova/build.json`:

```json
{
  "android": {
    "release": {
      "keystore": "cargame.keystore",
      "alias": "cargame",
      "storePassword": "YOUR_STORE_PASSWORD",
      "password": "YOUR_KEY_PASSWORD"
    }
  }
}
```

Build release:

```bash
cd cordova
npx cordova build android --release
```

Signed APK output: `cordova/platforms/android/app/build/outputs/apk/release/app-release.apk`

---

## Game Configuration for Android

### Landscape Lock
Already configured in `cordova/config.xml`:
```xml
<preference name="Orientation" value="landscape" />
```

### Hardware Acceleration
Enabled by default via:
```xml
<preference name="android-hardwareAccelerated" value="true" />
```

### Keep Screen On
The game uses `WakeLock`-style keep-awake via Cordova plugin or JS:
```javascript
// In index.html, already handled by fullscreen + visibility API
```

### Memory Management
- The game pauses rendering when `visibilitychange` fires (tab switch / screen lock)
- `requestAnimationFrame` is stopped entirely when hidden
- Audio context is suspended/resumed automatically

### Performance Notes
- Low-quality preset auto-detected on devices with <4GB RAM
- Particles disabled entirely on low preset
- AI traffic density reduced based on quality tier
- Shadow maps disabled on low preset

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ANDROID_HOME not set` | Set `ANDROID_HOME` env var to Android SDK path |
| `Java version mismatch` | Install JDK 17, set `JAVA_HOME` |
| `Gradle sync failed` | Delete `platforms/android/.gradle` and rebuild |
| `WebView crashes on start` | Ensure `android:hardwareAccelerated="true"` in AndroidManifest |
| `Touch not responding` | Check `touch-action: none` CSS is applied |
| `Low FPS on device` | The game auto-detects quality — verify `Renderer.autoDetectPerformance()` runs |
| `Audio not playing` | User must tap screen once (audio unlock overlay) |

---

## Quick Test Commands

```bash
# One-command build web + copy + debug APK
npm run build && rm -rf cordova/www && cp -r dist cordova/www && cd cordova && npx cordova build android --debug
```

## Offline Web Package

For pure web deployment (no Android), simply serve the `dist/` directory with any static file server:

```bash
# Test locally
npx serve dist

# Or open directly (some features may require HTTP server for ES modules)
# Double-click dist/index.html works in most modern browsers
```
