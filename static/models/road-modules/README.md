# Road Module Models

Place reusable road module `.glb` or `.gltf` files in this directory and reference them from `static/config/road-modules.json`.

## Model Requirements
- Use Y-up coordinates.
- Local origin should sit on the road center at ground contact.
- The module should extend forward along local `+Z`.
- Keep each module short and lightweight, ideally 4-12 meters long and under 4K triangles.
- If using a visual-only model, leave collision to the editor's simplified road strip.

## Config Example
```json
{
  "id": "asphalt_custom",
  "label": "自定义沥青模块",
  "url": "/models/road-modules/asphalt-custom.glb",
  "length": 8,
  "width": 8,
  "spacing": 7.8,
  "scale": 1,
  "yOffset": 0.04,
  "yawOffset": 0
}
```

The loader also accepts embedded `.gltf` files, which is useful for lightweight generated modules.
