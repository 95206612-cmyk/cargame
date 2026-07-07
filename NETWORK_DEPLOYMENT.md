# 真实网络联机部署说明

当前联机已经不是 COMING SOON：游戏客户端通过 WebSocket 连接 `server/src/index.js`，支持创建房间、加入房间、准备、房间规则同步、倒计时开赛、30Hz 位姿同步和房间列表刷新。

## 本机测试

```bash
npm run server
```

游戏里打开 `ESC -> MULTIPLAYER`，服务器地址填：

```text
ws://127.0.0.1:8080
```

点击“测试连接”，看到服务器在线后即可创建房间。

## 局域网联机

1. 在作为服务器的电脑上运行：

```bash
npm run server
```

2. 找到这台电脑的局域网 IP，例如 `192.168.1.23`。

3. 其他电脑或 APK 手机在同一 Wi-Fi 下填写：

```text
ws://192.168.1.23:8080
```

4. 如果连接失败，检查 Windows 防火墙是否允许 Node.js 入站，或开放 TCP `8080`。

## 公网联机

公网联机需要一台 VPS/云服务器，开放 TCP 端口，并建议绑定域名。

最简方式：

```bash
cd server
npm ci --omit=dev
HOST=0.0.0.0 PORT=8080 PUBLIC_URL=ws://你的服务器IP:8080 npm start
```

客户端填写：

```text
ws://你的服务器IP:8080
```

正式发布建议使用 Nginx/Caddy 反向代理并启用 TLS，客户端填写：

```text
wss://game.example.com
```

## PM2 部署

```bash
cd server
npm ci --omit=dev
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

## Docker 部署

```bash
cd server
docker compose up -d --build
```

## 服务接口

```text
GET /health
GET /rooms
WebSocket /
```

`/health` 用于前端“测试连接”，`/rooms` 用于公开房间列表。

## 需要的权限和网络条件

- 本机/LAN：允许 Node.js 或服务器程序监听 TCP `8080`。
- Windows 防火墙：允许入站 TCP `8080`。
- 云服务器安全组：开放 TCP `8080`，或开放 `443` 给反向代理。
- APK：局域网 `ws://` 可用；公网正式环境建议 `wss://`。
- 跨运营商公网联机：不建议靠家用路由器端口映射，推荐 VPS/云服务器。

## 当前网络模型

当前版本是轻量级实时同步：服务器管理房间、准备状态、比赛开始、排名和车辆位姿广播。物理仍主要由客户端计算，不是强权威反作弊服务器。后续如果要做排位赛/排行榜，需要继续升级为服务端权威校验。
