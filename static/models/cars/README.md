# static/models/cars/ — Vehicle GLB Models

## Naming Convention
- Lowercase, dash-separated: `sport-01.glb`, `muscle-02.glb`, `truck-03.glb`
- Prefer `.glb` (binary glTF) over `.gltf` for production builds

## Model Requirements
- Origin at vehicle center, Y-up
- Forward direction: +Z (or -Z, configurable per model)
- Separate mesh nodes: `body` (chassis + cabin), `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`
- Recommended: < 50K triangles for gameplay LOD0, < 150K for hero model
- One material per logical part; PBR metallic-roughness workflow

## Adding a New Car Model
1. Place `<car-id>.glb` in this directory
2. Add entry to `config/asset-path.json` under `models.cars`
3. No code changes required

## Supported Formats
| Format | Status |
|--------|--------|
| `.glb` | primary |
| `.gltf`| supported |
