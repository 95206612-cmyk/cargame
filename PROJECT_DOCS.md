# Street Racer 项目完整说明

本文档是当前项目的总说明，覆盖运行方式、目录结构、核心模块、配置资源、联机服务、打包流程、测试工具和常见维护流程。后续如果只想快速理解项目，优先阅读本文档。

## 1. 项目概览

`Street Racer` 是一个基于 Web 技术实现的 3D 街头赛车项目。前端使用 Vite、Three.js 和 cannon-es，支持浏览器运行、Electron 桌面打包、Capacitor Android 打包，并带有独立的 Node.js WebSocket 联机服务。

核心能力：

- 3D 赛车驾驶、漂移、氮气、检查点计时和圈速记录。
- 车辆库、车辆购买、车辆改装、涂装和玩家资料。
- 自由试驾、单人赛事、街头追逃、每日挑战、多人联机。
- 城市场景赛道、GLB 模型赛道、程序化备用赛道和可交互物体。
- 天气、天空盒、灯光、粒子、后处理、音频、HUD、设置面板。
- 关卡编辑器、资源检查器、静态检查、冒烟测试和网络集成测试。

技术栈：

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 构建 | Vite 6 | Web 开发服务器与生产构建 |
| 渲染 | Three.js | WebGL 3D 场景、PBR、灯光、后处理 |
| 物理 | cannon-es | 车辆刚体、RaycastVehicle、碰撞和路面摩擦 |
| 客户端网络 | WebSocket | 房间、准备、快照同步、排名和比赛事件 |
| 服务端 | Node.js + ws | 多人联机房间服务 |
| 桌面 | Electron | Windows 桌面应用打包 |
| Android | Capacitor | Android WebView 包装和原生配置 |
| 持久化 | localStorage | 玩家存档、设置、编辑器布局 |

## 2. 快速运行

安装依赖：

```bash
npm install
```

启动 Web 开发服务器：

```bash
npm run dev
```

默认 Vite 地址为 `http://localhost:3000`，实际端口以终端输出为准。不要直接双击 `index.html` 运行开发版，因为 ES modules、资源路径和部分浏览器权限需要本地 HTTP 服务。

生产构建：

```bash
npm run build
```

预览生产构建：

```bash
npm run preview
```

运行静态检查：

```bash
npm run test:static
```

完整 Web 构建检查：

```bash
npm run test
```

启动联机服务：

```bash
npm run server
```

联机服务默认监听 `ws://127.0.0.1:8080`。局域网联机时，把客户端里的服务器地址改成服务器电脑的局域网 IP，例如 `ws://192.168.1.23:8080`。

## 3. package.json 脚本

| 脚本 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建 Web 产物到 `dist/` |
| `npm run preview` | 预览 `dist/` 产物 |
| `npm run test` | 先跑静态检查，再跑生产构建 |
| `npm run test:static` | 运行 `tools/static-check.js` |
| `npm run test:smoke` | 运行 Playwright 冒烟测试 |
| `npm run test:network` | 运行联机服务集成测试 |
| `npm run server` | 运行根目录 `start-server.js` 启动联机服务 |
| `npm run server:start` | 进入 `server/` 并执行服务端 `npm start` |
| `npm run electron:dev` | 构建 Web 后用 Electron 开发方式打开 |
| `npm run electron:build` | 构建 Electron 安装包 |
| `npm run electron:build:portable` | 构建 Windows 便携版 |
| `npm run dist` | 构建 Windows NSIS 安装包和便携版 |

## 4. 根目录结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | Web 主入口，包含画布、加载屏、主菜单、HUD 外层和入口脚本 |
| `asset-checker.html` | 资源检查器页面入口 |
| `src/` | 游戏客户端源码 |
| `static/` | Vite `publicDir`，运行时按站点根路径提供资源 |
| `server/` | 多人联机 Node.js 服务端 |
| `electron/` | Electron 主进程和预加载脚本 |
| `android/` | Capacitor Android 工程 |
| `tools/` | 静态检查、冒烟测试、网络测试、资源导出等工具 |
| `dist/` | Web 构建产物，由 `npm run build` 生成 |
| `release/` | Electron 打包产物 |
| `release-latest/` | 已生成的桌面版产物备份或最新产物 |
| `release-build-temp/` | 打包临时目录 |
| `release-exe/` | 发布相关产物目录 |
| `node_modules/` | 根项目依赖 |
| `package.json` | 根项目依赖、脚本和 Electron Builder 配置 |
| `vite.config.js` | Vite 构建配置 |
| `capacitor.config.ts` | Capacitor Android 配置 |
| `PROJECT_DOCS.md` | 当前完整说明文档 |
| `NETWORK_DEPLOYMENT.md` | 联机部署专项说明 |
| `LEVEL_EDITOR_GUIDE.md` | 关卡编辑器专项说明 |
| `PBR_ASSET_RULES.md` | PBR 资源制作规范 |
| `BLENDER_GLB_WORKFLOW.md` | Blender/GLB 资源流程 |
| `BUILD_ANDROID.md` | Android 构建说明 |
| `RENDERING_STRATEGY.md` | 渲染策略说明 |
| `*.png`, `*.jpeg` | Playwright 或人工验证截图、纹理提取图、赛道检查图 |
| `vite-preview-*.log` | 本地预览和性能测试日志 |

建议把 `src/`、`static/`、`server/`、`electron/`、`android/`、`tools/` 和根配置视为源码；把 `dist/`、`release/`、`release-latest/`、`release-build-temp/` 视为生成物。

## 5. 启动与运行流程

浏览器打开项目后，`index.html` 加载 `/src/main.js`。`main.js` 创建 `App` 实例并完成初始化。

主要初始化顺序：

1. 创建 `AssetLoader`、`SaveManager`、`AudioManager`，读取本地存档。
2. 加载 `asset-path.json`、`carPhysics.json`、`cars.json`、`tracks.json`。
3. 创建车辆库、改装系统、涂装系统，并解析当前车辆。
4. 创建 `Renderer`、Three.js 场景、相机、灯光和天空盒。
5. 创建 cannon-es 物理世界和车辆物理。
6. 创建 `TrackManager`，加载当前赛道的 GLB 资源或程序化赛道。
7. 创建输入、UI、设置、车库、联机、关卡编辑器、天气、粒子、AI 交通和警车系统。
8. 注册菜单按钮对应的 `window.GameActions`。
9. 生成玩家车辆，进入主循环。

主循环每帧大致执行：

```text
读取输入
更新车辆物理和路面摩擦
推进物理世界
同步车辆模型和轮胎动画
更新 AI 交通、警车、追逃、计时和排名
处理交互物体、碰撞、路障、钉刺带和恢复逻辑
更新天气、粒子、音频、相机和 HUD
执行联机同步和远端车辆插值
渲染场景或后处理画面
```

## 6. src 客户端源码总览

| 路径 | 主要职责 |
| --- | --- |
| `src/main.js` | App 总控，负责初始化、模式切换、主循环、菜单动作和系统串联 |
| `src/assetLoader.js` | JSON、纹理、GLB、音频等异步资源加载和缓存释放 |
| `src/render/` | 渲染器、相机、灯光、天空盒、PBR 材质、后处理和环境管理 |
| `src/physics/` | cannon-es 物理世界和车辆物理 |
| `src/input/` | 键盘、触控、虚拟摇杆、移动端布局和标准化输入 |
| `src/scene/` | 赛道加载、程序化赛道、交互物体和场景管理 |
| `src/vehicle/` | 车辆模型、车灯、车辆库、改装、涂装、AI 交通、警车 AI |
| `src/game/` | 游戏模式、圈速计时、追逃系统和结果数据 |
| `src/effect/` | 粒子、火花、烟尘、天气和湿滑路面效果 |
| `src/audio/` | Web Audio 管理和车辆音效 |
| `src/ui/` | HUD、主菜单、车库、设置、联机、结算、玩家资料、关卡编辑器 |
| `src/data/` | 存档、玩家等级、货币、事件解锁和每日挑战记录 |
| `src/network/` | 客户端协议、WebSocket 管理、房间同步和插值 |
| `src/tools/` | 资源检查器页面逻辑 |

### 6.1 渲染模块

| 文件 | 说明 |
| --- | --- |
| `Renderer.js` | 创建 WebGL 渲染器，处理画质档位、阴影、PBR 材质升级、自适应分辨率和性能信息 |
| `CameraManager.js` | 管理追尾、座舱、远景、动态相机，包含碰撞避让、地面高度、相机震动和缩放 |
| `LightManager.js` | 管理早晨、白天、傍晚、雨雪等灯光预设，控制太阳光、环境光、路灯和阴影 |
| `SkyboxManager.js` | 管理天空预设、太阳盘、云层 GLB 天空盒和天气联动 |
| `PostProcess.js` | 封装后处理管线，包含泛光、拖影、暗角、色彩调整和 SMAA |
| `MaterialFactory.js` | 统一创建和调整 PBR 材质、车漆、涂装和赛道路面材质 |
| `EnvManager.js` | 管理环境预设、背景、雾、路灯和天空盒协同 |
| `LegacyRenderer.js` | 保留的旧渲染器实现，用于兼容或对比 |
| `index.js` | 渲染模块 barrel export |

画质配置来自 `static/config/quality-settings.json`，包含 `low`、`medium`、`high`、`ultra` 四档。项目还支持 `auto` 自动档，移动端会降低粒子数量、分辨率上限和部分效果。

### 6.2 物理模块

| 文件 | 说明 |
| --- | --- |
| `PhysicsWorld.js` | 封装 cannon-es 世界、重力、地面、碰撞材质、路面摩擦和刚体管理 |
| `VehiclePhysics.js` | 基于 RaycastVehicle 实现车辆动力、悬挂、转向、刹车、漂移、氮气、空中状态和重置 |
| `index.js` | 物理模块导出 |

核心物理数据来自：

- `static/config/carPhysics.json`：sports、muscle、truck 车辆物理模板，转向/加速/刹车曲线，漂移、氮气、路面摩擦、空中和重置参数。
- `static/config/physics.json`：通用重力、时间步长、世界参数和路面类型参数。
- `static/config/vehicle-params.json`：旧版或补充车辆参数。

### 6.3 输入模块

`src/input/InputManager.js` 统一处理键盘、触摸、虚拟摇杆和移动端按钮。标准化输出包含转向、油门、刹车、手刹、氮气、重置、视角切换、后视、暂停等状态。

PC 默认操作：

| 操作 | 按键 |
| --- | --- |
| 油门 | `W` 或上方向键 |
| 刹车/倒车 | `S` 或下方向键 |
| 左转 | `A` 或左方向键 |
| 右转 | `D` 或右方向键 |
| 手刹/漂移 | `Space` |
| 氮气 | `Shift` |
| 重置车辆 | `R` |
| 切换视角 | `C` |
| 视角重置 | `V` |
| 后视 | `B` |
| 暂停/菜单 | `Esc` 或 `P` |

移动端会显示虚拟摇杆和按钮，并支持横竖屏布局偏好。Capacitor 环境下还会尝试调用屏幕方向锁定能力。

### 6.4 场景和赛道模块

| 文件 | 说明 |
| --- | --- |
| `TrackManager.js` | 加载 GLB 赛道和景物，抽取道路中心线、边界、碰撞体、路面高度、检查点和出生点 |
| `TrackBuilder.js` | 程序化生成 city、mountain、coastal、rally、desert 风格赛道及护栏、建筑、坡道和装饰 |
| `InteractiveObjectManager.js` | 管理可放置物体、可破坏物、加速板、道路段、本地编辑器存储和车辆接触解析 |
| `index.js` | 简单场景管理和模块导出 |

赛道加载优先读取 `static/config/asset-path.json` 中的 GLB 资源。若资源缺失或需要备用，`TrackBuilder` 可以构建程序化赛道。

当前配置中的赛道：

| ID | 名称 | 圈数 | 长度 | 路面 | 难度 | 默认解锁 |
| --- | --- | ---: | ---: | --- | ---: | --- |
| `city_circuit` | City Circuit | 3 | 3509 | asphalt | 1 | 是 |
| `city_circuit_01` | City Circuit 01 | 3 | 1955 | asphalt | 1 | 是 |
| `mountain_pass` | Mountain Pass | 2 | 6800 | asphalt | 2 | 是 |
| `dirt_rally` | Dirt Rally | 2 | 5100 | dirt | 2 | 否 |
| `desert_dash` | Desert Dash | 1 | 12000 | sand | 3 | 否 |
| `coastal_highway` | Coastal Highway | 3 | 5500 | asphalt | 1 | 是 |

### 6.5 车辆模块

| 文件 | 说明 |
| --- | --- |
| `CarModel.js` | 支持外部 GLB 车身/车轮，也支持程序化车身；负责轮胎动画、车身俯仰和资源释放 |
| `CarLibrary.js` | 加载车辆与改装配置，判断解锁/拥有状态，购买车辆，计算最终属性 |
| `CarTune.js` | 购买和应用改装等级，计算改装后的物理配置 |
| `CarPaint.js` | 管理车漆、金属度、粗糙度、珠光、贴花和预设 |
| `CarLight.js` | 管理车灯、刹车灯、转向灯接口和环境联动 |
| `AITraffic.js` | 沿道路中心线运行的民用 AI 车辆，支持密度、LOD 和回到道路逻辑 |
| `PoliceAI.js` | 追逃警车、路障、钉刺带、包围、拦截、冲撞和距离检测 |
| `index.js` | 车辆模块导出 |

当前车辆配置：

| ID | 名称 | 车身风格 | 解锁等级 | 价格 | 最高速度 |
| --- | --- | --- | ---: | ---: | ---: |
| `tuner` | 街改车 | compact | 0 | 0 CR | 210 km/h |
| `coupe` | 性能轿跑 | sports | 1 | 5000 CR | 260 km/h |
| `super` | 顶级超跑 | supercar | 3 | 25000 CR | 330 km/h |
| `classic` | 复古老爷车 | muscle | 5 | 15000 CR | 200 km/h |

车辆资源位于 `static/models/cars/`，包括 `body.glb` 和四个车轮 GLB：`wheel_fl.glb`、`wheel_fr.glb`、`wheel_rl.glb`、`wheel_rr.glb`。

### 6.6 游戏模式模块

| 文件 | 说明 |
| --- | --- |
| `GameModeManager.js` | 管理自由试驾、单人赛事、追逃、每日挑战的开始和结算数据 |
| `TimerSystem.js` | 检查点、圈数、总时间、最佳圈速和捷径惩罚 |
| `PursuitManager.js` | 通缉星级、逃脱、被捕、奖励、罚款和警车事件 |
| `index.js` | 游戏模块导出，另含轻量 `GameManager` |

模式说明：

| 模式 | 说明 |
| --- | --- |
| 自由试驾 | 无计时、无对手、无警察，适合试车和调校 |
| 单人赛事 | 计时比赛，包含 AI 对手和排名结算 |
| 街头追逃 | 玩家触发通缉星级，警车追捕，目标是逃脱 |
| 每日挑战 | 固定车辆和短赛制计时，记录最佳成绩 |
| 多人联机 | 通过 WebSocket 房间进行准备、倒计时、比赛和同步 |

### 6.7 特效和天气模块

| 文件 | 说明 |
| --- | --- |
| `EffectManager.js` | 火花、烟尘、氮气尾焰等简单特效入口 |
| `ParticleManager.js` | Sprite 粒子池、烟雾、火花、尘土、氮气等粒子类型 |
| `WeatherSystem.js` | 晴天、雨、雪、湿滑路面、雾和天气摩擦倍率 |
| `index.js` | 特效模块导出 |

`src/main.js` 当前菜单天气项为：

- `clear_morning`
- `clear_noon`
- `clear_evening`
- `rain`
- `snow`

`static/config/env-presets.json` 还定义了 `day`、`dusk`、`night` 以及 `clear`、`rain` 的环境参数。

### 6.8 音频模块

| 文件 | 说明 |
| --- | --- |
| `AudioManager.js` | Web Audio 封装，总音量、音乐、音效、环境音、循环音效和播放控制 |
| `CarAudio.js` | 引擎、速度段、漂移、氮气、碰撞、喇叭等车辆音效逻辑 |
| `index.js` | 音频模块导出 |

浏览器需要用户手势才能启动音频，所以 `index.html` 中包含音频解锁层。`static/audio/README.md` 说明了音频资源命名规范；当前实际音频主要由代码合成或通过配置扩展。

### 6.9 UI 模块

| 文件 | 说明 |
| --- | --- |
| `index.js` | `UIManager`，负责 HUD、速度、圈数、氮气、排名、小地图、消息和追逃 HUD |
| `MainMenu.js` | 程序化主菜单实现 |
| `GarageUI.js` | 车辆选择、购买、改装、涂装和 3D 预览 |
| `SettingsUI.js` | 画质、音量、相机、控制、物理倍率、移动端布局等设置 |
| `MultiplayerUI.js` | 服务器地址、连接测试、房间创建/加入、房间规则、准备状态和玩家列表 |
| `ResultPopup.js` | 赛事、追逃、每日挑战结算弹窗 |
| `PlayerProfileUI.js` | 玩家资料、头像、称号、俱乐部、外观定制 |
| `LevelEditorUI.js` | 关卡编辑器面板、物体库、属性编辑、保存和导入导出交互 |

`index.html` 中主菜单入口包含：

- 角色信息
- 车库
- 自由试驾
- 单人赛事
- 街头追逃
- 每日挑战
- 选择赛道
- 游戏设置
- 多人联机
- 关卡编辑
- 资源检查
- 天气切换

### 6.10 数据模块

| 文件 | 说明 |
| --- | --- |
| `SaveManager.js` | 存档读取、保存、版本迁移、完整性检查、导入导出、配置加载 |
| `PlayerData.js` | 玩家等级、经验、货币、事件解锁、每日挑战和胜场统计 |
| `index.js` | 数据模块导出 |

主存档使用：

```text
localStorage key: cargame_save
version: 3
```

主要存档字段：

- `credits`
- `premiumPoints`
- `ownedVehicles`
- `unlockedTracks`
- `bestTimes`
- `playerProfile`
- `vehicleCustomization`
- `totalRaces`
- `totalWins`
- `playerLevel`
- `xp`
- `carTuning`
- `carPaints`
- `currentCarId`
- `currentTrackId`
- `unlockedEvents`
- `dailyChallengeBest`
- `settings`

关卡编辑器使用独立存储：

```text
localStorage key: cargame_level_editor_v1
```

这份编辑器数据保存在当前浏览器或 WebView 环境，不会自动写回项目内的 JSON 文件。

### 6.11 网络客户端模块

| 文件 | 说明 |
| --- | --- |
| `protocol.js` | 二进制协议编码/解码：加入、准备、位姿快照、检查点、Ping/Pong、错误 |
| `index.js` | `NetworkManager`，负责 WebSocket 连接、发送、接收和状态 |
| `NetworkSync.js` | 房间生命周期、准备状态、排名、比赛完成和远端状态 |
| `interpolation.js` | 远端车辆快照缓存、插值和四元数球面插值 |

客户端默认以固定频率发送车辆位置、旋转、速度、标志位和序号，服务端广播后由插值层平滑显示远端车辆。

## 7. static 资源和配置

`static/` 是 Vite 的 `publicDir`，构建后资源会被复制到 `dist/`。在浏览器里，`static/config/cars.json` 对应运行时 URL `./config/cars.json`。

### 7.1 配置文件

| 文件 | 说明 |
| --- | --- |
| `static/config/asset-path.json` | 模型、赛道、天空盒、道具、纹理、音频等资源路径总表 |
| `static/config/cars.json` | 车辆定义、价格、解锁等级、基础属性和默认颜色 |
| `static/config/carPhysics.json` | 车辆物理模板、操控曲线、漂移、氮气、路面和重置参数 |
| `static/config/tracks.json` | 赛道列表、圈数、长度、路面、难度和解锁状态 |
| `static/config/tuneConfig.json` | 改装类别、升级等级、费用、倍率和玩家等级经验 |
| `static/config/quality-settings.json` | low/medium/high/ultra 画质档位 |
| `static/config/env-presets.json` | 光照、背景、雾、路灯、头灯需求和天气参数 |
| `static/config/physics.json` | 通用物理世界和路面摩擦参数 |
| `static/config/vehicle-params.json` | 默认/sports/truck 车辆参数补充 |
| `static/config/objects.json` | 编辑器可交互物配置：软锥桶、油桶、路障、氮气板等 |

### 7.2 模型资源

| 路径 | 内容 |
| --- | --- |
| `static/models/cars/` | 车辆车身和四个车轮 GLB |
| `static/models/track/` | 城市赛道、景物、云层天空盒 GLB |
| `static/models/track/fbx/` | FBX 源文件和备份 GLB |
| `static/models/props/` | 道具资源规范说明，实际道具可继续补充 |

当前赛道 GLB 主要包括：

- `city-circuit-track.glb`
- `city-circuit-track_01.glb`
- `city-circuit-scenery.glb`
- `city-circuit-scenery_01.glb`
- `city-circuit-cloud.glb`
- `city-circuit-cloud_01.glb`

### 7.3 纹理和其他资源

| 路径 | 内容 |
| --- | --- |
| `static/textures/skybox/` | 天空盒图片和说明 |
| `static/textures/car-pbr/` | 车辆 PBR 贴图规范说明 |
| `static/textures/track-texture/` | 赛道路面贴图规范说明 |
| `static/textures/particle/` | 粒子贴图规范说明 |
| `static/textures/ui-sprite/` | UI 精灵图规范说明 |
| `static/audio/` | 音频资源规范说明 |
| `static/manifest.json` | PWA manifest，声明应用名、颜色、启动页和图标路径 |

注意：`manifest.json` 声明了 `icon-192.png` 和 `icon-512.png`。如果要正式发布 PWA，需要确认这些图标文件存在或补齐。

## 8. 多人联机服务

服务端位于 `server/`，依赖 `ws`。根目录 `start-server.js` 会启动服务并输出本机可用地址。

服务端文件：

| 文件 | 说明 |
| --- | --- |
| `server/src/index.js` | HTTP + WebSocket 服务入口，接口、连接、限流、房间创建和清理 |
| `server/src/room.js` | 房间、玩家加入/离开、准备、规则同步、倒计时、比赛状态、排名和广播 |
| `server/src/player.js` | 玩家状态数据结构 |
| `server/src/protocol.js` | 服务端二进制协议编解码 |
| `server/src/match.js` | 倒计时和比赛超时管理 |
| `server/package.json` | 服务端依赖和脚本 |
| `server/Dockerfile` | Docker 镜像构建 |
| `server/docker-compose.yml` | Docker Compose 部署 |
| `server/ecosystem.config.cjs` | PM2 部署配置 |

HTTP 接口：

| 接口 | 说明 |
| --- | --- |
| `GET /` | 服务基本信息 |
| `GET /health` | 健康检查、房间数、玩家数、WebSocket 地址 |
| `GET /rooms` | 公开房间列表 |
| `WebSocket /` | 联机协议入口 |

常用环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8080` | 监听端口 |
| `PUBLIC_URL` | 空 | 对外展示的 WebSocket 地址 |
| `ROOM_IDLE_MS` | `300000` | 空闲房间清理时间 |
| `MAX_ROOMS` | `100` | 最大房间数 |
| `MAX_PLAYERS_PER_ROOM` | `6` | 单房最大玩家数 |
| `HEARTBEAT_MS` | `30000` | 心跳间隔 |
| `MAX_MESSAGE_BYTES` | `65536` | 单消息最大字节数 |
| `MAX_MESSAGES_PER_SECOND` | `90` | 单连接控制消息限流 |
| `MAX_SNAPSHOTS_PER_SECOND` | `36` | 单连接快照限流 |

当前联机模型是轻量级实时同步：服务端管理房间、准备、倒计时、排名和广播，车辆物理主要仍由客户端计算。若后续要做排位、反作弊或权威排行榜，需要升级为更严格的服务端权威校验。

## 9. Electron 桌面版

Electron 入口：

| 文件 | 说明 |
| --- | --- |
| `electron/main.js` | 创建 BrowserWindow，根据开发/生产环境加载 Vite 或 `dist/index.html` |
| `electron/preload.js` | 预加载脚本，给渲染进程暴露安全桥接能力 |

Electron Builder 配置在根 `package.json` 的 `build` 字段中：

- `appId`: `com.cargame.streetracer`
- `productName`: `Street Racer`
- 输出目录：`release/`
- 打包文件：`dist/**/*`、`electron/**/*`、`package.json`
- Windows 目标：`nsis` 和 `portable`
- 便携版命名：`StreetRacer_Portable_${version}.exe`

构建桌面版前会先执行 Vite 构建。

## 10. Android / Capacitor

`capacitor.config.ts` 当前配置：

- `appId`: `com.cargame.streetracer`
- `appName`: `Street Racer`
- `webDir`: `dist`
- Android scheme: `https`
- `cleartext`: `true`
- `allowMixedContent`: `true`
- 背景色：`#1a1a2e`

常规流程：

```bash
npm run build
npx cap sync android
npx cap open android
```

如果使用 Android Studio 构建 APK，请以 `android/` 工程为准。局域网联机的 APK 可以使用 `ws://`，公网正式环境建议配置 `wss://`。

## 11. 工具和测试

| 文件 | 说明 |
| --- | --- |
| `tools/static-check.js` | 扫描源码、配置和关键文档，检查 JSON、关键入口和疑似乱码 |
| `tools/smoke-test.js` | Playwright 冒烟测试，用于确认页面能启动和渲染 |
| `tools/network-integration-test.js` | 启动/连接联机服务，测试房间和同步流程 |
| `tools/start-network-server.ps1` | Windows PowerShell 启动联机服务辅助脚本 |
| `tools/export-reference-assets.js` | 资源导出或参考资产处理脚本 |
| `src/tools/AssetChecker.js` | 浏览器内资源检查器逻辑 |

推荐检查顺序：

```bash
npm run test:static
npm run build
npm run test:smoke
npm run test:network
```

`npm run test` 已包含静态检查和生产构建，适合作为常规提交前检查。

## 12. 资源检查器

资源检查器入口是 `asset-checker.html`，核心逻辑位于 `src/tools/AssetChecker.js`。

它主要用于：

- 检查模型、纹理、配置资源。
- 预览 GLB 模型。
- 检查车辆模型命名约定和车轮节点。
- 检查赛道模型、道路、碰撞和配置。
- 导出检查报告。

主菜单中也有“资源检查”入口，会跳转或打开该工具。

## 13. 关卡编辑器

关卡编辑器由 `src/ui/LevelEditorUI.js` 和 `src/scene/InteractiveObjectManager.js` 组成。

主要能力：

- 在当前赛道上放置、选择、移动、复制、删除交互物。
- 编辑物体类型、质量、耐久、碰撞半径、缩放、旋转、吸附地面、是否可破坏、是否重生和特效。
- 支持道路编辑相关数据结构。
- 支持保存当前赛道布局。
- 编辑模式下切换到俯视/上帝视角，并冻结车辆。

当前可交互物来源：

- `static/config/objects.json`
- `InteractiveObjectManager.js` 内置类型

存储位置：

```text
localStorage key: cargame_level_editor_v1
```

编辑器保存的是本地浏览器数据，不会自动写入 `static/config`。若要把编辑结果随安装包发布，需要额外实现导出和写回配置的流程。

## 14. 添加内容的常见流程

### 14.1 添加新车辆

1. 将车辆 GLB 或拆分车身/车轮资源放到 `static/models/cars/`。
2. 在 `static/config/asset-path.json` 的 `models.cars` 中添加资源路径。
3. 在 `static/config/cars.json` 中添加车辆 ID、名称、价格、解锁等级、基础属性、车身风格和颜色。
4. 如需新物理模板，在 `static/config/carPhysics.json` 中补充。
5. 启动游戏，在车库确认车辆可见、可购买、可驾驶。
6. 运行 `npm run test:static` 和 `npm run build`。

### 14.2 添加新赛道

1. 准备 `*-track.glb` 和可选 `*-scenery.glb`、`*-cloud.glb`。
2. 放入 `static/models/track/`。
3. 在 `static/config/asset-path.json` 的 `models.tracks` 中登记。
4. 在 `static/config/tracks.json` 中添加赛道条目。
5. 确认 `TrackManager` 能抽取道路、出生点、检查点和碰撞体。
6. 如果 GLB 资源暂时缺失，可让 `TrackBuilder` 使用程序化备用赛道。

### 14.3 调整车辆手感

优先调整配置，不直接改代码：

- 基础属性：`static/config/cars.json`
- 物理模板和路面摩擦：`static/config/carPhysics.json`
- 通用世界参数：`static/config/physics.json`
- 改装倍率：`static/config/tuneConfig.json`

只有当需要新机制时，再修改 `VehiclePhysics.js` 或 `CarTune.js`。

### 14.4 添加音频

1. 将音频文件放入 `static/audio/`。
2. 在 `static/config/asset-path.json` 的音频段登记 ID。
3. 使用 `AudioManager.playSFX(id)`、循环 SFX 或 `CarAudio` 中的车辆音频逻辑调用。
4. 浏览器端确认音频解锁后能播放。

### 14.5 添加编辑器物体

1. 优先在 `static/config/objects.json` 添加可配置物体。
2. 如需特殊碰撞、特效或内置几何，扩展 `InteractiveObjectManager.js`。
3. 如需 UI 控制项，扩展 `LevelEditorUI.js`。
4. 在游戏中通过关卡编辑器放置并保存。

## 15. 重要运行数据

| 类型 | 存储位置 |
| --- | --- |
| 玩家存档 | `localStorage:cargame_save` |
| 关卡编辑器布局 | `localStorage:cargame_level_editor_v1` |
| Web 构建产物 | `dist/` |
| Electron 产物 | `release/` |
| 赛道和车辆模型 | `static/models/` |
| 运行时配置 | `static/config/` |
| 联机服务状态 | 服务端内存中的 `rooms` Map |

清空浏览器站点数据、重装 APK 或切换 WebView 环境都可能导致本地存档和编辑器数据丢失。

## 16. 已知注意事项

- `dist/`、`release/`、`release-latest/`、`release-build-temp/` 是生成物，日常开发不建议手工修改。
- 联机服务不是强权威物理服务器，适合轻量房间同步，不适合直接作为高可信竞技排行后端。
- 关卡编辑器保存到 localStorage，不会自动落盘到项目配置。
- `static/manifest.json` 声明了 PWA 图标，正式 PWA 发布前需要确认图标文件已补齐。
- `BUILD_ANDROID.md`、`LEVEL_EDITOR_GUIDE.md` 等历史专项文档如果在某些 Windows 终端中显示乱码，以本说明和源码为准。

## 17. 推荐维护习惯

- 修改功能前先确认入口在 `src/main.js` 中如何串联。
- 修改配置后运行 `npm run test:static`。
- 修改渲染、赛道、资源路径后运行 `npm run build` 并做一次浏览器启动验证。
- 修改联机协议时同时检查 `src/network/protocol.js` 和 `server/src/protocol.js`。
- 修改房间规则时同时检查 `src/ui/MultiplayerUI.js`、`src/network/NetworkSync.js` 和 `server/src/room.js`。
- 修改车辆手感时优先改 JSON 配置，再改 `VehiclePhysics.js`。
- 修改关卡编辑器时同时检查本地存储兼容性和导入导出数据结构。

## 18. 当前完成状态

当前项目已经具备完整可运行骨架：Web 端游戏、真实联机服务、桌面打包、Android 工程、GLB 资源、车辆系统、赛道系统、UI 面板、存档、编辑器和测试工具均已存在。后续主要工作应围绕内容打磨、资源补齐、体验优化、联机权威性和发布流程稳定化展开。
