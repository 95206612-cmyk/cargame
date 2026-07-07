# Rendering Strategy

## Goals

- Keep shadows readable without forcing very large shadow maps.
- Avoid frame-time spikes from shadow-map updates, material traversal, and high device pixel ratios.
- Preserve a stable 60 FPS target on common desktop and mobile GPUs.

## Current Runtime Strategy

- **Quality presets** live in `src/render/Renderer.js`.
- **Dynamic pixel ratio** lowers internal resolution in small steps when the frame-time moving average exceeds the target, then slowly restores it when the frame-time is stable.
- **Shadow-map updates are throttled** by quality level instead of updating every frame.
- **Shadow maps are capped at 4096** even on ultra to avoid large GPU memory spikes.
- **Scene PBR material preparation is cached** and rescanned only periodically.
- **AI traffic already sleeps at distance**, reducing update/render work for distant cars.

## Shadow Tuning

- Shadow strength is improved mostly through light contrast:
  - Slightly lower ambient and hemisphere intensities.
  - Slightly stronger sun intensity.
  - Tighter shadow camera near/far range.
- Contact shadow feel is controlled by:
  - `shadow.bias`
  - `shadow.normalBias`
  - `shadow.radius`
  - `shadow.blurSamples`

Avoid increasing `shadowMapSize` above `4096`; it can create visible stutter when the shadow map is allocated or rebuilt.

## Debugging

At runtime, inspect:

```js
window.__streetRacerDebug.render
```

Useful fields:

- `quality`
- `basePixelRatio`
- `dynamicPixelRatio`
- `frameTimeMs`
- `shadowMapSize`

If `dynamicPixelRatio` is frequently below `basePixelRatio`, the GPU is under pressure. Lower quality or reduce shadow/post effects before adding more scenery.

## Recommended Next Optimizations

- Add distance-based visibility for scenery/building groups.
- Add mesh LOD for imported GLB scenery.
- Batch static props that share materials.
- Move expensive visual effects to quality-gated paths.
