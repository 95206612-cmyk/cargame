# static/models/props/ — Scene Props & Decorations

## Naming Convention
- Lowercase, dash-separated: `barrier-concrete.glb`, `lamp-street.glb`, `billboard-large.glb`

## Model Requirements
- Y-up, centered at origin or at ground-contact point
- < 2K triangles per prop for performance
- One material, PBR metallic-roughness workflow
- Collision proxy (optional): separate node named `collision` using simplified box geometry

## Prop Categories
| Prefix    | Category          |
|-----------|-------------------|
| barrier-  | Barriers & fences |
| lamp-     | Street lamps      |
| sign-     | Signage & billboards |
| cone-     | Traffic cones     |
| tree-     | Vegetation        |
| misc-     | Miscellaneous     |

## Adding a New Prop
1. Place `.glb` in this directory
2. Add to `config/asset-path.json` under `models.props`
3. Instantiate via `SceneManager.addProp(propId, position)`

## Supported Formats
| Format | Status |
|--------|--------|
| `.glb` | primary |
