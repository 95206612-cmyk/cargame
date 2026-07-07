# static/textures/particle/ — Particle Effect Textures

## Naming Convention
- Lowercase, dash-separated: `smoke-puff.png`, `fire-trail.png`, `spark-burst.png`

## Requirements
- Square power-of-two: 64x64, 128x128, 256x256
- Grayscale or RGBA with pre-multiplied alpha
- Soft edges (feathered, no hard cutoffs)
- Recommended: sprite sheet layout for animated particles (e.g., 4x4 grid)

## Particle Types
| Prefix      | Effect            | Recommended Size |
|-------------|-------------------|------------------|
| smoke-      | Smoke/exhaust     | 128x128          |
| fire-       | Fire/afterburner  | 128x128          |
| spark-      | Sparks/debris     | 64x64            |
| dust-       | Dust/dirt kickup  | 128x128          |
| nitro-      | NOS burst         | 256x256          |
| rain-       | Raindrop          | 32x32            |

## Adding a New Particle Texture
1. Place `.png` in this directory
2. Add entry to `config/asset-path.json` under `textures.particles`
3. Reference by ID in `ParticleManager.emit(type, ...)`

## Supported Formats
| Format | Status |
|--------|--------|
| `.png` | primary |
