# static/models/track/ — Track & Scenery Models

## File Naming Convention

Each track is split into two files:

| Suffix | Purpose | Physics | Example |
|--------|---------|---------|---------|
| `-track.glb` | Racing surface, barriers, curbs, checkpoints | YES — road for nav, barriers for collision | `city-circuit-track.glb` |
| `-scenery.glb` | Buildings, trees, lamps, signs, props, terrain | NO — visual only | `city-circuit-scenery.glb` |

## Track Model Requirements (`*-track.glb`)
- **Road surface** meshes: flat or gently sloped, used to extract center-line path
- **Barrier/wall** meshes: used to generate physics colliders (keep as separate mesh objects)
- Origin at world center, Y-up
- Recommended: keep total file size manageable for fast loading

## Scenery Model Requirements (`*-scenery.glb`)
- **Buildings, trees, props, terrain, decorations**
- No naming requirements — all meshes are visual only
- Can be as detailed as needed (no physics impact)

## Supported Track IDs

| Track ID | Track File | Scenery File |
|----------|-----------|-------------|
| city-circuit | `city-circuit-track.glb` | `city-circuit-scenery.glb` |
| mountain-pass | `mountain-pass-track.glb` | `mountain-pass-scenery.glb` |
| stadium-arena | `stadium-arena-track.glb` | `stadium-arena-scenery.glb` |
| coastal-highway | `coastal-highway-track.glb` | `coastal-highway-scenery.glb` |

## Backwards Compatibility

If only a single `.glb` file exists (old format), it will be treated as the combined track+scenery model automatically.
