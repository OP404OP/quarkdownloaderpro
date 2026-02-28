<div align="center">

# Quark Downloader Pro

**夸克网盘分享链接批量下载工具**

[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey)]()

一个基于 **Tauri 2 + React 19** 构建的跨平台桌面应用，用于解析夸克网盘分享链接并批量下载文件。
支持扫码登录、Cookie 登录（含后端校验）、递归目录解析、文件树展示、可调并发批量下载。

**单文件绿色便携版** — 无需安装，双击即用  ☛[跳转下载](https://github.com/OP404OP/quarkdownloaderpro/releases/tag/main)

</div>

---

## ✨ 功能特性

- **双模式登录** — 支持夸克 APP 扫码登录和手动 Cookie 输入（保存前自动校验有效性），自动管理 Cookie 生命周期
- **智能链接解析** — 粘贴分享链接自动提取，支持带提取码 / 子目录的链接格式
- **递归目录扫描** — 自动遍历分享链接中的所有子目录，完整还原文件树结构
- **可视化文件树** — 树形展示分享内容，支持展开/折叠、按类型图标区分、勾选下载
- **多线程分片下载** — Rust 原生 128 线程并行下载引擎，≥10MB 文件自动启用 HTTP Range 分片加速，小文件回退单线程；实时速度与进度反馈，支持一键取消
- **批量并发处理** — 支持 1-10 文件并发度调节，自动完成「转存 → 获取直链 → 下载到本地 → 清理转存文件」全流程
- **绕过限速机制** — 使用特殊UA，绕过夸克23018错误
- **容量信息展示** — 登录后自动获取并展示网盘容量使用情况
- **流畅动效体验** — 基于 Framer Motion 的全局过渡动画，毛玻璃 UI 设计风格
- **单文件分发** — 后端 API 代理已内嵌至 Rust 二进制，无需外部依赖，开箱即用
- **跨平台支持** — 支持 Windows (x64 / ARM64) 和 macOS (x64 / ARM64 / Universal)

---

## 🏗 架构说明

```
┌──────────────────────────────────────────────────┐
│              Tauri 2 (单一 Rust 进程)             │
│                                                  │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │  WebView     │    │  内嵌 HTTP 服务 (axum) │  │
│  │  React 19    │◄──►│  127.0.0.1:3000        │  │
│  │  frontend/   │    │  API 代理              │  │
│  └──────────────┘    └──────────┬─────────────┘  │
│                                 │                 │
└─────────────────────────────────┼─────────────────┘
                                  │ HTTPS
                            夸克网盘 API / CDN
                  (pan.quark.cn / drive.quark.cn)
```

| 层级 | 技术 | 说明 |
|------|------|------|
| **Tauri Shell** | Rust + Tauri v2 | 桌面窗口容器 + 多线程下载引擎 + 内嵌 HTTP 服务 |
| **内嵌 API 服务** | axum + reqwest | 替代原 Node.js sidecar，编译到同一二进制中，随窗口自动启停 |
| **Frontend** | React 19 + TypeScript + Vite 6 + TailwindCSS + Zustand + Axios | 单页应用，通过 HTTP 调用内嵌 API 服务 |

**数据流**：
- API 调用：`前端 → Axios(http://127.0.0.1:3000/api/*) → 内嵌 axum 服务 → HTTPS → 夸克网盘官方 API`
- 文件下载：`前端 → Tauri IPC(invoke) → Rust 多线程下载引擎(reqwest · 32 线程分片) → HTTPS → CDN`

---

## 🚀 快速开始

### 环境要求

| 工具 | 版本要求 |
|------|----------|
| [Node.js](https://nodejs.org/) | >= 18.x |
| [Rust](https://www.rust-lang.org/tools/install) | >= 1.70 |
| [Tauri CLI](https://v2.tauri.app/start/prerequisites/) | v2.x |

> **Windows 用户**：需安装 [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
> **macOS 用户**：需安装 Xcode Command Line Tools：`xcode-select --install`

### 安装依赖

```bash
# 克隆项目
git clone https://github.com/YOUR_USERNAME/quark-downloader-pro.git
cd quark-downloader-pro

# 安装根目录依赖
npm install

# 安装前端依赖
cd frontend && npm install && cd ..
```

### 开发模式

```bash
npm run tauri:dev
```

一条命令即可启动 Tauri 桌面开发模式（自动编译 Rust + 启动前端 dev server + 内嵌 API 服务）。

### 构建生产版本

```bash
npm run tauri:build
```

#### 分平台 / 分架构构建

| 命令 | 平台 | 产物 |
|------|------|------|
| `npm run tauri:build` | 当前平台默认架构 | 便携 exe / .app + .dmg |
| `npm run tauri:build:win-x64` | Windows x86_64 | 便携 exe |
| `npm run tauri:build:win-arm64` | Windows ARM64 | 便携 exe |
| `npm run tauri:build:mac-x64` | macOS Intel | .app + .dmg |
| `npm run tauri:build:mac-arm64` | macOS Apple Silicon | .app + .dmg |
| `npm run tauri:build:mac-universal` | macOS 通用二进制 | .app + .dmg (兼容所有 Mac) |

> 交叉编译需先安装对应 target：`rustup target add <target-triple>`

#### 产物路径

| 平台 | 产物 | 路径 |
|------|------|------|
| **Windows** | 独立 exe，双击直接运行 | `src-tauri/target/release/Quark Downloader Pro.exe` |
| **macOS** | .app + .dmg | `src-tauri/target/release/bundle/macos/` 和 `bundle/dmg/` |

---

## 📖 使用指南

### 1. 登录账号

启动应用后，点击侧边栏 **「立即登录」** 按钮，选择登录方式：

- **扫码登录**：点击「获取二维码」，使用夸克 APP 扫码，二维码有效期 120 秒
- **Cookie 登录**：打开 [pan.quark.cn](https://pan.quark.cn) 登录后，从浏览器 DevTools 提取 Cookie 并粘贴，点击「保存配置」后会自动向后端校验有效性

### 2. 解析分享链接

在搜索栏粘贴夸克网盘分享链接（支持带提取码），点击 **「解析提取」** 或按 Enter 键。

支持的链接格式：
```
https://pan.quark.cn/s/xxxxxxxxx
https://pan.quark.cn/s/xxxxxxxxx?pwd=xxxx
https://pan.quark.cn/s/xxxxxxxxx#/list/share/xxxx
```

### 3. 选择并下载文件

- 解析完成后，文件以树形结构展示，支持展开/折叠目录
- 勾选需要下载的文件（支持「全选」）
- 在侧边栏调节并发数（1-10），点击 **「开始任务」** 启动批量下载
- 下载流程全自动：转存 → 获取直链 → Rust 多线程分片下载到本地 → 清理转存文件

### 4. 退出登录

侧边栏底部点击 **「退出登录」**，会同时清除本地 Cookie 并通知夸克服务端注销。

---

## 📁 项目结构

```
quark-downloader-pro/
├── frontend/                    # 前端 React SPA
│   ├── src/
│   │   ├── components/          # 通用 UI 组件
│   │   │   ├── ui/              # 基础组件 (Button, Card, Dialog, Checkbox...)
│   │   │   ├── MainLayout.tsx   # 主布局框架（侧边栏 + Toast + 全局进度条）
│   │   │   ├── Sidebar.tsx      # 侧边栏导航
│   │   │   └── TitleBar.tsx     # 自定义无边框标题栏
│   │   ├── features/            # 业务功能模块
│   │   │   ├── auth/            # 登录认证（扫码 + Cookie，含后端校验）
│   │   │   ├── share-parse/     # 分享链接解析
│   │   │   ├── file-tree/       # 文件树展示
│   │   │   ├── download/        # 下载管理器
│   │   │   ├── capacity/        # 容量统计
│   │   │   └── help/            # 帮助与关于
│   │   ├── services/
│   │   │   ├── http.ts          # Axios 实例（拦截器自动注入 Cookie）
│   │   │   └── quarkApi.ts      # 夸克网盘 API 封装
│   │   ├── store/
│   │   │   └── useQuarkStore.ts # Zustand 全局状态
│   │   ├── types/quark.ts       # TypeScript 类型定义
│   │   └── utils/index.ts       # 工具函数
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── src-tauri/                   # Tauri 桌面容器 + 内嵌 API 服务
│   ├── src/
│   │   ├── main.rs              # Rust 入口，启动 Tauri 窗口 + 内嵌 axum 服务
│   │   ├── api_server.rs        # axum HTTP 路由（全部 API 端点 + 流式下载代理）
│   │   └── quark_client.rs      # 夸克 API 代理核心（reqwest HTTP 客户端）
│   ├── capabilities/            # Tauri 权限配置
│   ├── icons/                   # 应用图标
│   ├── tauri.conf.json          # Tauri 核心配置
│   └── Cargo.toml               # Rust 依赖
│
├── package.json                 # 根 monorepo 脚本
└── README.md
```

---

## 🛠 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| [React](https://react.dev/) | 19 | UI 框架 |
| [TypeScript](https://www.typescriptlang.org/) | 5.7 | 类型安全 |
| [Vite](https://vite.dev/) | 6 | 构建工具 |
| [TailwindCSS](https://tailwindcss.com/) | 3.4 | 原子化 CSS |
| [Zustand](https://zustand.docs.pmnd.rs/) | 5 | 状态管理 |
| [Axios](https://axios-http.com/) | 1.7 | HTTP 客户端 |
| [Radix UI](https://www.radix-ui.com/) | latest | 无障碍基础组件 |
| [Framer Motion](https://motion.dev/) | 12 | 动画引擎 |
| [Lucide React](https://lucide.dev/) | latest | 图标库 |
| [qrcode.react](https://github.com/zpao/qrcode.react) | 4 | 二维码生成 |

### Rust 后端（内嵌于 Tauri 二进制）

| 技术 | 版本 | 用途 |
|------|------|------|
| [Tauri](https://v2.tauri.app/) | 2 | 桌面应用框架 |
| [axum](https://github.com/tokio-rs/axum) | 0.8 | 内嵌 HTTP 服务框架 |
| [reqwest](https://github.com/seanmonstar/reqwest) | 0.12 | HTTPS 客户端，代理请求至夸克 API |
| [tokio](https://tokio.rs/) | 1 | 异步运行时 |
| [tower-http](https://github.com/tower-rs/tower-http) | 0.6 | CORS 中间件 |
| [serde](https://serde.rs/) / [serde_json](https://github.com/serde-rs/json) | 1 | JSON 序列化 |

---

## 🔌 API 接口

内嵌 axum 服务作为代理层，将前端请求转发至夸克官方 API：

| 本地接口 | 说明 |
|----------|------|
| `GET  /api/health` | 健康检查 |
| `GET  /api/qrlogin/token` | 获取扫码登录 Token |
| `GET  /api/qrlogin/query` | 轮询扫码登录状态 |
| `GET  /api/qrlogin/cookie` | 用 service_ticket 换取完整 Cookie（含多步 __puus 补全） |
| `POST /api/share/token` | 获取分享访问令牌（stoken） |
| `GET  /api/share/detail` | 获取分享文件列表（支持分页） |
| `POST /api/share/save` | 转存文件到自己网盘 |
| `GET  /api/task` | 查询异步任务状态 |
| `POST /api/file/download` | 获取文件下载直链 |
| `POST /api/file/delete` | 删除文件（清理临时转存） |
| `GET  /api/member` | 获取会员/容量信息 |
| `POST /api/logout` | 退出登录（含服务端注销 + 状态验证） |

> Cookie 通过 `x-cookie` 请求头传递，服务端通过 `x-append-cookie` 响应头自动补全。

---

## 🤝 贡献指南

欢迎贡献代码！请遵循以下流程：

1. **Fork** 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'feat: add your feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 **Pull Request**

### 开发规范

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
- 前端代码使用 ESLint 检查：`cd frontend && npm run lint`
- 组件按功能模块组织在 `features/` 目录下
- 通用 UI 组件放置在 `components/ui/` 目录下

---

## 🙏 鸣谢

- [muyan556/gopeed-extension-quark](https://github.com/muyan556/gopeed-extension-quark) — 核心解析逻辑参考

---

## ⚠️ 免责声明

本软件仅用于**技术学习与交流**，严禁用于任何非法用途。用户在使用过程中的一切行为需自行承担法律责任。开发者不保证软件的绝对稳定性与持续性，请根据需要合理使用。

---

## 📄 License

[MIT](./LICENSE)
