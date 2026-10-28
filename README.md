# Bao.Dumpling 三端同步模拟版

保留现有菜单和界面，顾客点餐、厨房接单、收银 POS 共用中央数据库，并通过 WebSocket 同步桌号、订单、金额和状态。只提供模拟付款，不会扣款，也不计入真实营业收入。

## 开始使用

Windows 安装 Node.js 22.13.0 或更新版本后，双击 **启动本地测试.cmd**。保持服务窗口运行，手机、iPad、电脑连接同一个 Wi-Fi。

也可执行：

```powershell
npm ci
npm run local:setup
npm run local:start
```

- 顾客：电脑局域网地址的根路径。
- 厨房：同一地址的 /kitchen。
- 收银：同一地址的 /pos。
- 店员设备首次输入启动窗口中的对应配对码，保存 30 天。

[完整使用、配置与云端部署步骤](docs/本地测试与云端部署.md)

本版本尚未部署到原 Sites 云端网址。原营业数据库保持不变。本地数据在 .wrangler/bao-local，设备密钥在 .dev.vars；这些文件不会上传 GitHub。GitHub 保存代码，不等于备份订单数据库。

GitHub Pages 是静态托管，不能单独运行本版的服务器接口、中央数据库或 WebSocket。云端部署使用 Cloudflare Workers、D1、R2 和 Durable Objects，配置模板已包含。

## 验证

启动本地服务后运行 npm run test:three-terminal（Windows Microsoft Edge）。另可运行 npx tsc --noEmit 和 npm run cloud:check。

原 Sites 工程及开发说明保留在 [工程说明](docs/Sites原工程说明.md)。日常三端本地测试使用 local:start，不使用原 Vinext 开发命令。
