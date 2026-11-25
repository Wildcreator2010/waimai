# 电脑版（桌面客户端）

桌面端在系统托盘常驻，外卖入柜时直接弹 **Windows / macOS / Linux 系统通知**，点通知跳回对应提醒详情。
界面不是另写的一套，而是**直接加载 Web 站点**（`web/` 的 React 应用），所以用户端与 8 个管理页在桌面端全部可用。

## 1. 为什么是 Electron + React + Fluent UI

需求最初提的是「用 C 或 React」，并同时要求 Fluent UI 与三平台。这三者不能同时成立：

| 方案 | Fluent UI | 三平台 | 结论 |
|---|---|---|---|
| 纯 C（Win32 / Cocoa / GTK 三套 UI） | ✗ Fluent UI 没有 C 实现 | 需三份 UI 代码 | 不满足 Fluent UI |
| WinUI 3（原生 Fluent） | ✓ | ✗ 仅 Windows | 不满足三平台 |
| Electron + React + `@fluentui/react-components` v9 | ✓ | ✓ | 采用 |

选 Electron 的额外收益：`web/` 已有的 React 页面、鉴权、状态管理、管理端全部复用，桌面端只需新增一层壳。

## 2. 结构

```
desktop/                     Electron 壳（独立 npm 包，不含任何业务 UI）
  src/main.ts                窗口 / 生命周期 / 单实例 / 深链 / 导航守卫
  src/preload.ts             contextBridge → window.mealDesktop（白名单 API）
  src/tray.ts                托盘图标（内联 base64）+ 菜单 + Windows 角标
  src/notifications.ts       系统通知封装（不支持时降级托盘气泡）
  src/ntfy.ts                主进程内 ntfy 流式订阅（断线指数退避重连）
  src/autostart.ts           开机自启（Windows/macOS 登录项，Linux autostart）
  src/setup-window.ts        首次运行的站点地址设置窗口
  src/ipc.ts / src/config.ts IPC 装配与配置读写
web/src/lib/desktop.ts       Web 侧对 window.mealDesktop 的类型与判空封装
web/src/components/DesktopSettings.tsx
                             设置页「桌面端」卡片（仅桌面环境渲染）
```

**关键设计：窗口加载站点地址，而不是 `file://`。**
后端 refresh token 是 httpOnly cookie，`file://` 起源拿不到也发不出，登录态会立刻失效。
因此桌面端加载的是用户自己的站点根地址（开发期 `http://127.0.0.1:5173`），Cookie 与同源策略行为与浏览器一致。

## 3. 桌面端专属能力

| 能力 | 实现位置 | 说明 |
|---|---|---|
| 托盘常驻 | `tray.ts` | 关窗口缩到托盘；菜单含打开主窗口 / 提醒任务 / 通知设置 / 管理后台 / 开机自启 / 退出 |
| 系统通知 | `notifications.ts` | 点击通知显示主窗口并导航到 `/reminders/:id` |
| ntfy 实时订阅 | `ntfy.ts` | 在**主进程**内订阅，绕开渲染进程的 CORS；服务端返回的 `wss://` 会映射为 `https://` |
| 开机自启 | `autostart.ts` | Windows/macOS 用 `app.setLoginItemSettings`；Linux 写 `~/.config/autostart/*.desktop` |
| 单实例 + 深链 | `main.ts` | `mealreminder://` 协议；第二个实例把深链交给已有窗口 |
| 导航守卫 | `main.ts` | 只允许站点同源导航；外链交给系统浏览器；拒绝新建窗口 |

Web 侧的接线（`AppLayout.tsx`）：
- 桌面环境下把 `/api/me/ntfy/config` 的 `serverUrl` + `topic` 与用户的 `ntfyEnabled` 下发给主进程；
- 收到入柜推送后 `invalidateQueries(['reminders'])`，界面不会停在旧状态。

## 4. 构建与运行

```bash
# 1. 先起 Web 与后端（桌面端加载的是站点，不是本地打包页面）
cd web && npm run dev          # http://127.0.0.1:5173
cd server && npm run start     # http://127.0.0.1:8787

# 2. 装桌面端依赖（国内必须走镜像，且 Electron 二进制要单独指定镜像）
cd desktop
$env:ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/"
npm install --cache ../.npm-cache

# 3. 构建并启动
npm run build
npm start
```

生产环境用 `MEAL_APP_URL=https://你的域名` 或首次运行弹出的设置窗口指定站点地址。

## 5. 验证命令

```bash
cd desktop
npm run build        # tsc 类型检查
npm run smoke:ci     # 启动壳、建托盘、打印 SMOKE_OK 后退出（不联网）
npm run smoke:load   # 额外加载站点，确认 React 已挂载（需要 web dev server 在跑）
npm run dist:nosign  # 打 Windows 安装包（见 §5.1）
```

`smoke:load` 成功输出示例：

```
SMOKE_LOAD_OK http://127.0.0.1:5173 title=取餐提醒 path=/login bridge=object
```

它不只验证 HTTP 200，而是在 `did-finish-load` 后检查三件事：`#root` 有子节点（避免「加载成功但白屏」）、
标题正确、`window.mealDesktop` 是 object（证明 preload 的 contextBridge 真的注入到了渲染进程）。

### 5.1 打包

```bash
npm run dist          # 默认配置：含 exe 图标与版本信息，需要符号链接特权（见下）
npm run dist:nosign   # 无特权环境：exe 沿用 Electron 默认图标，功能不受影响
```

产物在 `desktop/release/`：`win-unpacked/`（免安装目录）与 `取餐提醒-<版本>-x64.exe`（NSIS 安装包，约 82 MB）。

**已验证**：安装包可构建；`release/win-unpacked/取餐提醒.exe --smoke-test --smoke-load` 输出
`SMOKE_LOAD_OK ... bridge=object`，即打包后的二进制能启动、加载站点、preload 桥可用。
**未验证**：安装/卸载流程本身、以及安装后从托盘启动的行为。

打包链路里有三处与这台机器环境有关的绕法，与代码无关：

| 现象 | 处理 |
|---|---|
| 下载 Electron zip 时 `Access is denied` | `electron-builder.yml` 里 `electronDist: node_modules/electron/dist`，直接用已安装的运行时，不再下载 |
| 子进程无法写 `%LOCALAPPDATA%\electron-builder` | 设 `ELECTRON_BUILDER_CACHE=<工作区内目录>` |
| makensis 报 `Unable to create temporary file` | 把 `TEMP`/`TMP` 指到工作区内目录 |
| winCodeSign 解压失败（创建 macOS `.dylib` 符号链接需要特权） | 用 `dist:nosign`；或在开发者模式/管理员下用默认配置 |

## 6. 已知限制（未验证 / 环境限制）

| 项 | 状态 |
|---|---|
| 系统通知真实弹出与点击跳转 | 未验证（需要真实桌面会话的通知权限） |
| 真实 ntfy 服务连通 | 仅用本地 mock 验证了流解析与重连 |
| 安装 / 卸载流程、安装后托盘启动 | **未验证**（安装包已构建，但没实际安装） |
| exe 图标与版本信息 | 无特权环境下走 `dist:nosign`，沿用 Electron 默认图标 |
| 代码签名 | 未签名，Windows 会提示未知发布者 |
| 单实例锁 | 依赖 Chromium 命名管道；受限环境拿不到锁，非 smoke 启动会直接退出（正常桌面不受影响） |
| 开机自启写入真实登录项 | 未验证（避免污染当前系统） |
| macOS / Linux | 代码已按平台分支实现，**未在真机编译运行**，也未出 dmg / AppImage |

## 7. Web 端 Fluent UI 迁移说明

`web/` 的 22 个页面只依赖 10 个共享展示组件，因此换肤只改了组件内部，页面代码零改动：

| 组件 | 内部实现 |
|---|---|
| `Button` | `Button`（primary/secondary/danger/ghost → appearance；loading → 禁用 + Spinner） |
| `Card` / `CardHeader` | `Card` + `CardHeader` |
| `Field` / `Input` / `Textarea` / `Switch` | `Field` / `Input` / `Textarea` / `Switch` |
| `Modal` | `Dialog`（点遮罩与 Esc 关闭） |
| `DataTable` | `Table` 系列 |
| `Badge` | `Badge`（tone → color，appearance=tint） |
| `AlertBanner` / `ErrorState` | `MessageBar`（intent 映射，warn/error 用 assertive） |
| `Spinner` / `LoadingBlock` | `Spinner` |
| `PageHeader` / `Pagination` | `Text` 排版令牌 + 共享 Button |

两个刻意的保留：

1. **`Select` 仍是原生 `<select>`**。Fluent 的 `Dropdown` 是 `options`/`onOptionSelect` 异步 API，而 7 处调用方都按 `event.target.value` 写，替换要动 4 个页面且收益仅是外观；改为按 Fluent 规范（4px 圆角 + 中性描边）重排原生控件。
2. **`Field` 不用 Fluent 的 label 槽位**。Fluent v9 的 `Field` 没有 `htmlFor`，靠克隆子控件自动关联；本仓库页面都显式写了 `htmlFor` + `id`，因此自己渲染 `<label>` 保证关联确定，`Field` 只负责 hint / 校验文案。

主题：`web/src/theme.ts` 以现有 Tailwind 品牌蓝 `#2563eb` 生成 Fluent 品牌色阶（`createLightTheme`）。
不这么做的话，Fluent 默认品牌色 `#0f6cbd` 会和页面里大量 `bg-brand-600` 并存，看起来像两个产品。

**体积影响**：构建产物从约 190 KB 增至 664 KB（gzip 193 KB）。如果在意首屏，可对管理端路由做 `React.lazy` 拆分。
