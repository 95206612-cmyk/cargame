# static/textures/car-pbr/ — Vehicle PBR Texture Maps

## Naming Convention
- Lowercase, underscore-separated: `sport_01_basecolor.png`, `sport_01_normal.png`, `sport_01_metallic.png`
- Suffix indicates map type (see table below)

## Required Texture Set (per livery)
| Suffix         | Map Type      | Channels | Notes                  |
|----------------|---------------|----------|------------------------|
| `_basecolor`   | Albedo/Base   | RGB      | sRGB, no lighting baked in |
| `_normal`      | Normal Map    | RGB      | OpenGL convention (-Y) |
| `_metallic`    | Metallic      | R        | 0=dielectric, 1=metal  |
| `_roughness`   | Roughness     | R        | 0=glossy, 1=rough      |
| `_ao`          | Ambient Occlusion | R    | Optional, mixed in shader |
| `_emissive`    | Emission      | RGB      | Optional, for lights   |

## Resolution Guidelines
| Quality   | Base Color | Normal/Metallic/Rough |
|-----------|-----------|----------------------|
| Ultra     | 2048x2048 | 2048x2048            |
| High      | 2048x2048 | 1024x1024            |
| Medium    | 1024x1024 | 512x512              |
| Low       | 512x512   | 256x256              |

## Format
- Prefer `.png` for lossless compression
- `.webp` accepted for low-quality presets (auto-detected by AssetLoader)

## Adding a New Livery
1. Place texture set in this directory
2. Add entry to `config/asset-path.json` under `textures.carLiveries`
3. Apply via `MaterialFactory.applyLivery(mesh, liveryId)`
