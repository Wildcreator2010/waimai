# 取餐提醒 · 桌面客户端

Electron 桌面壳，直接加载 Web 站点地址（不是 `file://`），复用 `web/` 的全部界面。
桌面端不复制前端代码，也不参与前端构建；`web/` 与 `server/` 保持独立部署。

> 为什么加载站点地址：后端 refresh token 是 httpOnly Cookie，`file://` 或跨源加载都会让 Cookie 失效。
> 因此 `appUrl` 必须是用户实际登录的站点根地址（开发环境为 Vite dev server）。

## 目录结构

```
desktop/
├─ src/
│  ├─ main.ts           # 应用入口：单实例锁、窗口、生命周期、协议、IPC 装配
│  ├─ config.ts         # config.json 读写（默认值 + 损坏容错 + 环境变量覆盖）
│  ├─ tray.ts           # 托盘图标/菜单（图标为内联 base64 PNG）
│  ├─ notifications.ts  # Electron Notification 封装与降级
│  ├─ autostart.ts      # 开机自启（Windows/macOS 登录项、Linux .desktop）
│  ├─ ntfy.ts           # 主进程 ntfy 流式订阅（断线指数退避重连）
│  ├─ ipc.ts            # ipcMain.handle / webContents.send 装配
│  ├─ preload.ts        # contextBridge 暴露 window.mealDesktop（含入参校验）
│  └─ setup-window.ts   # 首次运行的站点地址设置窗口（内联 data: URL 表单）
├─ electron-builder.yml
├─ package.json
├─ tsconfig.json
└─ .npmrc
```

## 安装

在 `desktop/` 目录执行（npm 官方源在国内可能卡死，使用 npmmirror）：

```powershell
cd desktop
$env:ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/"
npm install --cache "C:\Users\<you>\Desktop\WildProject\waimai\.npm-cache"
```

> 若 Electron 二进制下载被本机安全软件/沙箱拦截，可单独重跑：
>
> ```powershell
> $env:ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/"
> $env:ELECTRON_CACHE="C:\Users\<you>\Desktop\WildProject\waimai\.npm-cache\electron"
> node node_modules\electron\install.js
> ```

## 开发运行

1. 先启动后端与前端（在各自目录，不属于本包）：
   - `server/`：NestJS，默认 `http://127.0.0.1:8787`
   - `web/`：`npm run dev`，默认 `http://127.0.0.1:5173`
2. 编译并启动桌面端：

```powershell
cd desktop
npm run build
npm start
```

首次运行且没有配置时，会弹出一个小设置窗口，填写站点地址（默认 `http://127.0.0.1:5173`）并保存。
配置写入 `app.getPath('userData')/config.json`：

| 平台 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\meal-reminder-desktop\config.json` |
| macOS | `~/Library/Application Support/meal-reminder-desktop/config.json` |
| Linux | `~/.config/meal-reminder-desktop/config.json` |

环境变量 `MEAL_APP_URL` 可覆盖配置文件中的 `appUrl`（优先级最高，用于自动化测试；不会写回文件）：

```powershell
$env:MEAL_APP_URL="http://127.0.0.1:5173"; npm start
```

## 冒烟测试

不依赖网络、不需要 Web 服务在运行：

```powershell
npm run smoke
```

成功时输出 `SMOKE_OK <版本号>` 并以退出码 0 结束。
冒烟模式会创建隐藏窗口与托盘，但**不加载站点、不连接 ntfy、不弹首次设置窗口**（缺配置时使用默认值）。

> 受限环境（如禁止 Chromium 沙箱/命名管道、或 userData 目录不可写的 CI 沙箱）可改用：
>
> ```powershell
> npm run smoke:ci
> ```
>
> 该脚本额外带上 `--no-sandbox --single-process --user-data-dir=.smoke-data`，仅用于这类环境；
> 正常桌面请用 `npm run smoke`。

## 打包

```powershell
npm run dist
```

产物输出到 `desktop/release/`：

- Windows：NSIS 安装包（x64）
- macOS：dmg（arm64 + x64）
- Linux：AppImage

`electron-builder.yml` 中 `files` 只包含 `dist/` 与 `package.json`。
首次打包会从 GitHub 下载 electron-builder 的工具链；如果下载卡住超过 3 分钟，通常是网络问题，可配置镜像后重试，不要反复重试。

## 配置项

`config.json` 字段（全部可选，缺失走默认值）：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `appUrl` | string | `http://127.0.0.1:5173` | Web 站点根地址；导航/外链同源判断都基于它 |
| `autostart` | boolean | `false` | 开机自启（实际状态以系统为准，托盘勾选会回写此字段） |
| `closeToTray` | boolean | `true` | 关闭窗口时隐藏到托盘而不是退出 |
| `ntfyEnabled` | boolean | `false` | 是否在主进程订阅 ntfy |
| `ntfyServerUrl` | string | `https://ntfy.sh` | ntfy 服务器根地址（不带末尾斜杠） |
| `ntfyTopic` | string | `""` | ntfy 订阅主题（单段，不支持含 `/`） |

配置文件损坏时会自动改名为 `config.json.corrupt` 并回退默认值。

## 渲染进程 API（`window.mealDesktop`）

```ts
platform: string
appVersion: string
getConfig(): Promise<Config>
setConfig(patch: Partial<Config>): Promise<Config>
notify(payload: { title: string; body: string; path?: string }): Promise<boolean>
navigate(path: string): Promise<void>          // 主窗口 loadURL(appUrl + path)
openExternal(url: string): Promise<void>       // 仅 http(s)/mailto
setBadge(count: number): Promise<void>         // 托盘 tooltip + Windows overlay 徽标
isAutostartEnabled(): Promise<boolean>
setAutostart(enabled: boolean): Promise<boolean>
ntfyStatus(): Promise<{ connected: boolean; serverUrl: string | null; topic: string | null }>
onNavigate(cb: (path: string) => void): () => void
onNtfyMessage(cb: (msg: { title: string; message: string; tags?: string[] }) => void): () => void
```

所有异步 API 在入参非法时返回 rejected promise；`onNavigate` / `onNtfyMessage` 返回取消订阅函数。
`preload` 只暴露白名单方法，不暴露 `ipcRenderer` 本体。

## 自定义协议

应用注册了 `mealreminder://` 协议，例如 `mealreminder://reminders/123` 会聚焦主窗口并导航到站点内的 `/reminders/123`。
Windows 通过启动参数 / `second-instance` 处理，macOS 通过 `open-url` 处理。

## 安全模型

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- 不使用 `remote` 模块
- `setWindowOpenHandler` 拒绝所有新窗口；http(s) 非同源外链交给 `shell.openExternal`
- `will-navigate` / `will-redirect` 只允许 `appUrl` 同源，其余阻止并外跳
- 设置窗口同样启用 `sandbox`，表单通过 `executeJavaScript` 取回结果，不挂 preload
- ntfy 订阅放在主进程（Node http/https），避免渲染进程 CORS

## 已知限制

- 系统通知的真实弹出、点击跳转依赖操作系统通知权限，自动化环境无法验证。
- 真实 ntfy 长连接与断线重连未在联调环境验证；单元层面的解析/退避逻辑已实现。
- Windows overlay 徽标只显示 1–9 与 `9+`（`>9` 统一显示 `9+`），托盘 tooltip 显示完整数量。
- ntfy 主题按单段 URL 编码，不支持带 `/` 的多级主题。
- 未配置代码签名证书：Windows SmartScreen / macOS Gatekeeper 会提示；macOS 未做真机验证。
- 未提供安装包图标（`build/icon.ico` 等），安装包使用 Electron 默认图标；托盘图标已内联。
- 首次设置窗口只做 `http(s)://` 前缀校验，保存时主进程会再次归一化；不提供“测试连接”按钮。
- Linux 的 `.desktop` 自启与 AppImage 未在真机验证。
- 桌面端不注入任何前端补丁；Web 端如需感知桌面环境，可自行检测 `window.mealDesktop`。
