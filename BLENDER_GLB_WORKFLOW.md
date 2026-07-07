# Blender 制作 PBR 材质并导出 GLB 流程

本文档用于 Street Racer 新 PBR 渲染引擎的模型制作与导出。目标是让 Blender 里的材质效果尽量稳定地带入游戏，避免贴图丢失、红白路肩变色块、材质不受光、模型比例错误等问题。

## 1. 推荐文件结构

建议每条赛道建立一个独立工作目录：

```text
track_city_circuit/
  source/
    city-circuit.blend
    city-circuit.max
    reference/
  textures/
    road_asphalt_basecolor.jpg
    road_asphalt_normal.png
    road_asphalt_roughness.png
    curb_redwhite_basecolor.png
    grass_basecolor.jpg
    grass_normal.png
    barrier_metal_basecolor.png
    barrier_metal_roughness.png
  export/
    city-circuit-track.glb
    city-circuit-scenery.glb
```

最终进项目的文件放到：

```text
static/models/track/city-circuit-track.glb
static/models/track/city-circuit-scenery.glb
```

## 2. Blender 场景基础设置

打开 Blender 后先设置单位：

1. 右侧 `Scene Properties`。
2. 找到 `Units`。
3. `Unit System` 选择 `Metric`。
4. `Unit Scale` 设置为 `1.0`。
5. 按游戏标准理解：`1 Blender unit = 1 meter`。

坐标方向：

- `Z` 轴是 Blender 向上轴。
- glTF/GLB 导出后会自动适配到 Three.js 的 `Y-up` glTF 坐标。
- 不要手动把整个模型转倒或额外旋转 90 度。

## 3. 导入 OBJ / FBX 源模型

### 导入 FBX

菜单：

```text
File > Import > FBX (.fbx)
```

常用选项：

- `Scale` 保持 `1.0`。
- 如果模型导入后大小不对，优先在 Blender 里统一缩放后 `Apply Scale`，不要靠导出时乱调比例。

### 导入 OBJ

菜单：

```text
File > Import > Wavefront (.obj)
```

OBJ 注意事项：

- `.obj`、`.mtl`、贴图文件要在同一套相对路径下。
- OBJ 材质通常比较弱，导入后多数需要重建 PBR 材质。
- 如果贴图没有自动连上，在 Shader Editor 里手动绑定。

## 4. 清理模型

导入后先做清理，不要急着调材质。

### 应用变换

选中模型或所有模型：

```text
Ctrl + A > Apply > Rotation & Scale
```

目的：

- 防止 GLB 导出后比例错乱。
- 防止法线、碰撞、阴影计算异常。

### 检查法线方向

进入编辑模式：

```text
Tab > Mesh > Normals > Recalculate Outside
```

或快捷键：

```text
Shift + N
```

如果有局部反面：

1. 打开 `Viewport Overlays`。
2. 勾选 `Face Orientation`。
3. 蓝色为正面，红色为反面。
4. 红色面需要翻转或重新计算。

### 删除无用物体

删除以下内容：

- 隐藏但仍导出的高模。
- 多余相机。
- 多余灯光。
- 空的空物体。
- 没有用的重复模型。
- 被完全遮挡的内部面。

## 5. 赛道 Mesh 拆分规则

`city-circuit-track.glb` 里建议至少拆成这些 Mesh：

```text
road_asphalt_main
curb_redwhite_inner
curb_redwhite_outer
barrier_metal_left
barrier_metal_right
wall_concrete_xxx
finish_line
```

`city-circuit-scenery.glb` 里建议拆成：

```text
terrain_grass
terrain_sand
building_grandstand
building_pit
lamp_post
sign_motul
tree_palm
fence_metal
```

重要规则：

- 路面不要和草地、建筑、护栏合并。
- 护栏/墙体要单独 Mesh，方便生成碰撞。
- 红白路肩建议单独 Mesh 或单独材质。
- 赛道路面应连续、平滑、闭合，避免碎面、断裂、重叠面。

## 6. Blender 中创建 PBR 材质

推荐使用 Blender 默认的 `Principled BSDF`。

打开 `Shader Editor` 后，标准节点结构如下：

```text
Image Texture (BaseColor) -> Principled BSDF / Base Color
Image Texture (Normal) -> Normal Map -> Principled BSDF / Normal
Image Texture (Roughness) -> Principled BSDF / Roughness
Image Texture (Metallic) -> Principled BSDF / Metallic
Image Texture (AO) -> Mix/Multiply with BaseColor, or export as separate AO where possible
Principled BSDF -> Material Output / Surface
```

## 7. 贴图色彩空间设置

这是最容易出错的地方。

### BaseColor / Emissive

在 Image Texture 节点里：

```text
Color Space = sRGB
```

适用：

- `basecolor`
- `albedo`
- `diffuse`
- `emissive`
- logo / 广告牌 / 红白路肩颜色图

### Normal / Roughness / Metallic / AO / Alpha

在 Image Texture 节点里：

```text
Color Space = Non-Color
```

适用：

- `normal`
- `roughness`
- `metallic`
- `metalness`
- `ao`
- `alpha`
- `height`
- `mask`

如果 Roughness 或 Normal 被设成 sRGB，游戏里会出现反光不对、材质发灰、凹凸异常。

## 8. 常用材质制作方法

### 沥青路面 road_asphalt

Principled BSDF 参数：

```text
Metallic: 0.0 - 0.05
Roughness: 0.68 - 0.88
Specular IOR Level: 默认即可
```

贴图：

```text
road_asphalt_basecolor.jpg -> Base Color, sRGB
road_asphalt_normal.png -> Normal Map, Non-Color
road_asphalt_roughness.png -> Roughness, Non-Color
```

建议：

- 路面不要在 basecolor 里烘太重的阴影。
- 法线强度不要太大，`Normal Map Strength` 建议 `0.3 - 0.8`。
- 沥青可以使用平铺 UV，但不要让红白路肩和沥青共用拉伸严重的 UV。

### 红白路肩 curb_redwhite

Principled BSDF 参数：

```text
Metallic: 0.0
Roughness: 0.45 - 0.7
```

贴图：

```text
curb_redwhite_basecolor.png -> Base Color, sRGB
curb_redwhite_normal.png -> Normal Map, Non-Color
```

建议：

- 红白条必须有足够 UV padding。
- 不要把红白条贴到 atlas 图片最边缘。
- 如果使用 atlas，UV 岛之间至少留 `8px - 16px`。
- 红白路肩最好单独材质，避免和沥青 atlas 串色。

### 草地 terrain_grass

Principled BSDF 参数：

```text
Metallic: 0.0
Roughness: 0.85 - 1.0
```

贴图：

```text
grass_basecolor.jpg -> Base Color, sRGB
grass_normal.png -> Normal Map, Non-Color
grass_roughness.png -> Roughness, Non-Color
```

### 金属护栏 barrier_metal

Principled BSDF 参数：

```text
Metallic: 0.6 - 0.95
Roughness: 0.22 - 0.48
```

贴图：

```text
barrier_basecolor.png -> Base Color, sRGB
barrier_roughness.png -> Roughness, Non-Color
barrier_metallic.png -> Metallic, Non-Color
```

### 玻璃 glass_window

Principled BSDF 参数：

```text
Alpha: 0.25 - 0.6
Metallic: 0.0
Roughness: 0.02 - 0.12
Transmission Weight: 0.1 - 0.4
Alpha Blend: 开启
```

材质设置：

```text
Material Properties > Settings > Blend Mode = Alpha Blend
```

注意：

- 玻璃尽量不要大量双面。
- 大面积透明材质会增加排序和性能压力。

### 发光广告牌 / 灯

Principled BSDF：

```text
Base Color: 正常颜色
Emission Color: 发光颜色或贴图
Emission Strength: 1.0 - 5.0
```

注意：

- Emission 会让材质自己发亮，但不会自动照亮周围物体。
- 如果需要照亮周围，需要在游戏里配 PointLight / SpotLight。

## 9. 贴图尺寸建议

| 资产 | PC 推荐 | Android 推荐 |
| --- | ---: | ---: |
| 整体赛道 atlas | 2048 - 4096 | 2048 |
| 沥青平铺贴图 | 2048 | 1024 - 2048 |
| 红白路肩贴图 | 1024 - 2048 | 1024 |
| 草地/沙地/泥地 | 1024 - 2048 | 1024 |
| 建筑近景 | 1024 - 2048 | 1024 |
| 广告牌/Logo | 1024 - 2048 | 1024 |
| 玩家车辆车身 | 2048 - 4096 | 1024 - 2048 |
| 轮胎/轮毂 | 1024 - 2048 | 512 - 1024 |

建议使用 2 的幂尺寸：

```text
512, 1024, 2048, 4096
```

APK 版本尽量不要使用 `8192`。

## 10. 贴图格式建议

推荐：

```text
.png  -> normal, roughness, metallic, ao, alpha, logo, red-white curb
.jpg  -> asphalt basecolor, grass basecolor, sand basecolor, building large color map
```

不建议直接进游戏：

```text
.tga
.tif
.psd
.webp
```

如果源文件是 PSD/TIF，先导出 PNG/JPG 再绑定到 Blender 材质。

## 11. UV 检查

进入 UV Editing 工作区检查：

- UV 不要严重拉伸。
- 红白路肩条纹宽度要均匀。
- 广告牌文字不能镜像或倒置。
- Atlas 中 UV 岛之间留 padding。
- 路面平铺 UV 可以超过 0-1，但 logo 和路肩 atlas 通常应保持在对应区域内。

检查方法：

1. 选中 Mesh。
2. 进入 Edit Mode。
3. 打开 UV Editor。
4. 选择所有面。
5. 查看 UV 是否在正确贴图区域。

## 12. 材质命名

材质名要包含游戏识别关键词。

推荐：

```text
mat_road_asphalt
mat_curb_redwhite
mat_terrain_grass
mat_terrain_sand
mat_barrier_metal
mat_wall_concrete
mat_glass_window
mat_light_emissive
mat_sign_motul
mat_car_paint
```

不要使用：

```text
Material.001
DefaultMaterial
lambert1
phong2
未命名材质
```

## 13. Blender 中预览 PBR 效果

建议使用：

```text
Rendered View
```

渲染器：

```text
Eevee Next 或 Cycles
```

检查：

- BaseColor 是否正常。
- Normal 是否方向正确。
- Roughness 是否过亮或过油。
- Metalness 是否只有金属区域为高值。
- Emissive 是否亮度合适。
- 红白路肩是否清晰。
- 广告牌文字是否正向且不糊。

注意：Blender 预览和游戏里不会 100% 一样，但材质结构应该一致。

## 14. GLB 导出设置

菜单：

```text
File > Export > glTF 2.0
```

右侧导出选项：

```text
Format: glTF Binary (.glb)
Include: Selected Objects 或 Visible Objects
Transform > +Y Up: 开启
Data > Mesh: 开启
Data > Materials: 开启
Data > Images: Automatic
Data > Shape Keys: 按需
Animation: 如果没有动画，关闭
Compression: 当前项目暂不建议开启 Draco
```

推荐导出前：

1. 只选择要导出的对象。
2. `Ctrl + A > Apply Rotation & Scale`。
3. 保存 `.blend`。
4. 导出 `.glb`。

## 15. 分别导出 track 和 scenery

### 导出 `city-circuit-track.glb`

只选择：

```text
road_asphalt_*
curb_*
barrier_*
wall_*
finish_line
```

导出为：

```text
city-circuit-track.glb
```

### 导出 `city-circuit-scenery.glb`

只选择：

```text
terrain_*
building_*
lamp_*
sign_*
tree_*
fence_*
prop_*
```

导出为：

```text
city-circuit-scenery.glb
```

## 16. 导出后自检

导出后先用外部查看器检查：

- Blender 重新导入 GLB。
- 或用 Windows 3D Viewer。
- 或用在线 glTF Viewer。

必须确认：

- 红白路肩存在。
- 沥青不是纯灰色块。
- 草地、沙地、广告牌贴图正常。
- 透明玻璃没有整块黑色。
- 模型比例正确。
- 没有整体旋转 90 度。
- 材质数量没有异常暴增。

## 17. 放入游戏项目

复制到：

```text
D:/Codex/cargame/static/models/track/city-circuit-track.glb
D:/Codex/cargame/static/models/track/city-circuit-scenery.glb
```

如果是新赛道，还要确认配置：

```text
static/config/asset-path.json
```

或项目当前使用的：

```text
config/asset-path.json
```

里面的 track ID 指向正确文件。

## 18. 游戏中常见问题

### 贴图变成色块

常见原因：

- UV 错误或严重拉伸。
- atlas padding 太小。
- BaseColor 没有正确连接。
- GLB 导出没有包含图片。
- 材质名太混乱，引擎按默认材质处理。
- 贴图本身分辨率太低。

### 红白路肩没显示

检查：

- 路肩 Mesh 是否真的导出。
- 材质是否绑定了红白贴图。
- UV 是否落在红白贴图区域。
- 材质名是否包含 `curb` 或 `kerb`。
- 是否被其他路面 Mesh 重叠遮住。

### 材质太亮或太油

检查：

- Roughness 是否设置为 Non-Color。
- Metallic 是否错误设成 1。
- BaseColor 是否烘了强高光。
- Normal 强度是否过大。

### 游戏里比例不对

检查：

- Blender 单位是否为 Metric。
- 是否 Apply Rotation & Scale。
- 导出时 Scale 是否保持 1。
- 是否在项目配置里又设置了额外 scale。

## 19. 最终交付清单

每条赛道交付：

```text
city-circuit-track.glb
city-circuit-scenery.glb
city-circuit.blend
textures/
```

每辆车交付：

```text
car_body.glb
wheel_fl.glb
wheel_fr.glb
wheel_rl.glb
wheel_rr.glb
car_source.blend
textures/
```

如果车辆是单文件，也可以：

```text
car_complete.glb
```

但需要保证轮胎 Mesh 独立，方便游戏同步转向和滚动。

