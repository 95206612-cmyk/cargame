# static/audio/ — Audio Assets

## Naming Convention
- Lowercase, dash-separated: `engine-idle.wav`, `crash-impact.wav`, `menu-click.wav`

## Audio Categories
| Prefix      | Category         | Format | Notes                    |
|-------------|------------------|--------|--------------------------|
| engine-     | Engine sounds    | .wav   | Looping, RPM-variant     |
| crash-      | Collision SFX    | .wav   | One-shot, varied impact  |
| ui-         | UI sounds        | .wav   | Short, low-latency       |
| ambient-    | Ambient loops    | .wav   | Looping, stereo          |
| music-      | Background music | .mp3   | Compressed for size      |
| tire-       | Tire/skid SFX    | .wav   | Looping, surface-variant |
| nitro-      | Nitro boost SFX  | .wav   | One-shot                 |

## Requirements
- 16-bit, 44100 Hz minimum for SFX
- Keep individual files < 2 MB (streaming-friendly)
- Normalize to -3dB peak

## Adding New Audio
1. Place file in this directory
2. Add entry to `config/asset-path.json` under `audio`
3. Play via `AudioManager.playSFX('id')`

## Supported Formats
| Format | Status |
|--------|--------|
| `.wav` | primary (SFX) |
| `.mp3` | primary (music) |
| `.ogg` | accepted |
