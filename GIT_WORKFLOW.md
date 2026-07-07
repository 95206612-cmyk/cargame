# Git 使用规则与备份说明

本文档用于记录当前项目的 Git 备份、提交、推送、回退和发布标签规则。以后无论是人工操作还是 Codex 操作，都优先按这里的流程执行。

## 当前仓库信息

- 本地项目目录：`D:\Codex\cargame`
- 主分支：`main`
- 远程仓库：`https://github.com/95206612-cmyk/cargame.git`
- 远程名：`origin`
- Git 身份：`player <103057003@qq.com>`
- 大文件管理：已启用 Git LFS

## Git 管理范围

Git 用来管理：

- 源代码：`src/`
- 游戏配置：`static/config/`
- 模型、贴图、音频等资源：通过 Git LFS 管理
- Android / Electron 工程配置
- 项目文档
- 自动化测试脚本和工具脚本

Git 不管理：

- `node_modules/`
- `dist/`
- `release/`
- `android/app/build/`
- `android/.gradle/`
- `.log` 日志
- `.pid` 运行进程文件
- 本地测试截图和临时验证图片
- APK、EXE、AAB 等构建产物

安装包应继续使用时间戳单独放在 `release/`，但不提交到 Git。

## 每次开发前

先查看当前状态：

```powershell
git status
```

如果显示工作区干净，说明可以继续开发：

```text
working tree clean
```

如果有未提交内容，先判断这些内容是不是本次要继续的工作。不要随便覆盖或删除未确认的修改。

## 每次完成一批功能后

建议先跑测试：

```powershell
npm test
```

然后查看修改：

```powershell
git status
```

加入本次修改：

```powershell
git add .
```

提交：

```powershell
git commit -m "feat: 简短描述本次完成的功能"
```

推送到远程：

```powershell
git push
```

## 提交信息建议

常用前缀：

- `feat:` 新功能
- `fix:` 修复问题
- `polish:` 体验和表现优化
- `perf:` 性能优化
- `docs:` 文档更新
- `build:` 打包、构建配置更新
- `backup:` 阶段性备份

示例：

```powershell
git commit -m "feat: add curved road module deformation"
git commit -m "fix: repair mobile landscape brake layout"
git commit -m "docs: add git workflow guide"
git commit -m "backup: stable progress before packaging"
```

## 稳定版本标签

当某个版本已经测试通过，并且 Windows / APK 安装包也制作完成，可以打一个稳定标签：

```powershell
git tag v20260708-stable
git push origin v20260708-stable
```

如果要查看所有标签：

```powershell
git tag
```

如果要切到某个稳定版本查看：

```powershell
git checkout v20260708-stable
```

查看完回到主分支：

```powershell
git checkout main
```

## 安全回退方式

优先使用 `git revert`，它会生成一个新的“反向提交”，不会破坏远程历史。

先查看历史：

```powershell
git log --oneline
```

回退某一次提交：

```powershell
git revert 提交号
git push
```

示例：

```powershell
git revert abc1234
git push
```

这种方式最适合已经推送到 GitHub 的内容。

## 临时查看旧版本

如果只是想临时打开旧版本看看，不要修改历史：

```powershell
git checkout 提交号
```

查看完回到最新版：

```powershell
git checkout main
```

如果切到旧版本后要运行项目，可能需要：

```powershell
npm install
npm test
```

## 强制回退方式

`git reset --hard` 会直接丢弃当前版本之后的提交，不建议随便使用。只有明确确认要整体回到旧版本时才使用。

本地强制回到旧提交：

```powershell
git reset --hard 提交号
```

如果这个回退也要覆盖远程：

```powershell
git push --force-with-lease
```

注意：这会改写远程历史。一般不主动使用，除非已经确认没有其他人依赖远程历史。

## 分支使用建议

当前项目可以先保持简单，日常都在 `main` 上做小步提交。

如果要做风险较大的功能，例如重做物理、重做网络、重做关卡编辑器，可以新建功能分支：

```powershell
git checkout -b feature/road-editor-v3
```

开发完成后回到主分支：

```powershell
git checkout main
```

合并：

```powershell
git merge feature/road-editor-v3
git push
```

## Git LFS 说明

本项目使用 Git LFS 管理大资源，例如：

- `.glb`
- `.gltf`
- `.fbx`
- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.wav`
- `.mp3`
- `.ogg`

查看 LFS 文件：

```powershell
git lfs ls-files
```

如果在新电脑拉取项目，先安装并启用 Git LFS：

```powershell
git lfs install
git clone https://github.com/95206612-cmyk/cargame.git
cd cargame
git lfs pull
npm install
```

如果遇到 GitHub LFS 锁校验问题，可以确认本仓库已关闭该远程的锁校验：

```powershell
git config --get lfs.https://github.com/95206612-cmyk/cargame.git/info/lfs.locksverify
```

期望输出：

```text
false
```

## 打包产物规则

Windows 和 APK 安装包不提交到 Git。

推荐继续按时间戳保存在 `release/`：

```text
Street Racer Setup 0.1.0_YYYYMMDD_HHMMSS.exe
StreetRacer_Portable_0.1.0_YYYYMMDD_HHMMSS.exe
StreetRacer_v0.1.0_debug_YYYYMMDD_HHMMSS.apk
StreetRacer_v0.1.0_release_YYYYMMDD_HHMMSS.apk
```

如果某个安装包是重要稳定版，可以额外复制到外部备份盘或网盘。

## 推荐日常流程

开发前：

```powershell
git status
```

完成修改后：

```powershell
npm test
git status
git add .
git commit -m "feat: 本次完成内容"
git push
```

制作稳定包后：

```powershell
git tag vYYYYMMDD-stable
git push origin vYYYYMMDD-stable
```

出问题优先回退：

```powershell
git log --oneline
git revert 出问题的提交号
git push
```

## Codex 操作约定

Codex 后续处理本项目时遵守：

- 修改前先看 `git status`
- 不主动删除未确认的用户修改
- 不提交 `dist/`、`release/`、`node_modules/` 等生成物
- 完成一批功能后优先跑 `npm test`
- 用户要求“备份进度”时，执行 `git add .`、`git commit`、`git push`
- 用户要求“制作安装包”时，只把产物放入 `release/`，不提交产物
- 回退版本优先用 `git revert`
- 不主动执行 `git reset --hard` 或强推，除非用户明确要求

