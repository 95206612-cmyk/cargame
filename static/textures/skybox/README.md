# static/textures/skybox/ — Skybox Cube Maps

## Naming Convention
- Lowercase, underscore-separated: `day_clear_px.png`, `sunset_hazy_nx.png`
- Suffix indicates cubemap face: `_px` (+X), `_nx` (-X), `_py` (+Y), `_ny` (-Y), `_pz` (+Z), `_nz` (-Z)

## Preset Skyboxes
| Preset ID | Description | Faces |
|-----------|-------------|-------|
| day-clear | Bright blue sky, sharp sun | 6 x 1024 |
| day-cloudy | Overcast, soft shadows | 6 x 1024 |
| sunset | Orange/pink horizon, warm tones | 6 x 1024 |
| night | Dark sky, visible stars, moon | 6 x 1024 |
| night-city | Night with city glow on horizon | 6 x 1024 |

## Requirements
- 1024x1024 per face recommended (4096 total per skybox)
- `.png` or `.jpg` (PNG preferred for star masks)
- Seamless at edges (test with cubemap viewer)
- sRGB color space

## Adding a New Skybox
1. Place 6 face images in this directory following naming convention
2. Add entry to `config/asset-path.json` under `textures.skyboxes`
3. Switch at runtime via `EnvManager.setSkybox('preset-id')`

## Supported Formats
| Format | Status |
|--------|--------|
| `.png` | primary |
| `.jpg` | accepted |
