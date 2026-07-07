# static/textures/track-texture/ — Track & Environment Textures

## Naming Convention
- Lowercase, underscore-separated: `asphalt_worn_basecolor.png`, `grass_dirt_normal.png`
- Prefix indicates surface type (see table)

## Texture Types
| Prefix     | Surface      | Notes                        |
|------------|-------------|------------------------------|
| asphalt_   | Asphalt     | Tiling road surface          |
| concrete_  | Concrete    | Barriers, walls              |
| dirt_      | Dirt/Gravel | Off-road sections            |
| grass_     | Grass       | Terrain, medians             |
| sand_      | Sand        | Desert tracks, traps         |
| curb_      | Curbs       | Track edge markings          |
| decal_     | Decals      | Skid marks, paint stripes    |

## Requirements
- Power-of-two dimensions (512, 1024, 2048)
- Seamless tiling (test with offset grid)
- PBR texture set: basecolor + normal + roughness (metallic/ao optional for terrain)

## Supported Formats
| Format | Status |
|--------|--------|
| `.png` | primary |
| `.webp`| accepted |
| `.jpg` | accepted (basecolor only, no alpha) |
