# WebMCP DevTools

一个用于检查、测试和监控通过 `navigator.modelContext` 注册的 [WebMCP]() 工具的 Chrome 扩展。

[English](#english) | 中文

![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)

## 什么是 WebMCP？

**Web Model Context Protocol (WebMCP)** 是一个浏览器原生 API，允许网页通过 `navigator.modelContext` 为 AI 模型注册工具。WebMCP DevTools 提供强大的侧面板，让你实时查看和操作这些工具。

## 功能特性

| 功能 | 说明 |
|------|------|
| **工具检测** | 自动检测当前页面注册的所有 WebMCP 工具 |
| **声明式 WebMCP** | 自动识别 `<form toolname="...">` 声明式工具 |
| **跨标签页聚合** | 所有标签页的工具统一管理和展示 |
| **MCP Bridge** | 通过 WebSocket 桥接浏览器工具到 Cursor / Claude Desktop 等 AI 客户端 |
| **AI 助手** | 内置 AI 面板，支持 Gemini / OpenAI / Claude / DeepSeek，流式输出 + Markdown 渲染 |
| **Schema 可视化** | 以可折叠树形结构查看输入 Schema，支持 `$ref` / `allOf` / `oneOf` / `anyOf` |
| **表单生成** | 根据 JSON Schema 自动生成交互式表单 |
| **工具执行** | 直接从侧面板执行工具并即时查看结果 |
| **性能统计** | 执行成功率、平均/最小/最大耗时统计 |
| **统一执行记录** | 标记来源（手动 / AI 面板 / MCP Bridge），跨来源统一展示 |
| **事件时间线** | 实时追踪工具注册、注销和变更事件 |
| **执行历史** | 查看最近执行的输入/输出详情 |
| **快照 & 对比** | 保存工具定义快照并对比变化 |
| **导出** | 支持 JSON、Markdown、Postman Collection、TypeScript 代码导出 |
| **国际化** | 中英文双语支持，一键切换 |
| **主题** | 支持跟随系统、明亮、暗色三种主题 |

## MCP Bridge 集成

WebMCP DevTools 可以将浏览器中的工具桥接到外部 AI 客户端（如 Cursor、Claude Desktop）。

### 安装 MCP 服务

```bash
npm install -g webmcp-devtools-server
```

### Cursor 配置

在 `.cursor/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server"]
    }
  }
}
```

### Claude Desktop 配置

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server"]
    }
  }
}
```

### 使用方法

1. 启动 AI 客户端（Cursor / Claude Desktop）
2. 在浏览器中打开有 WebMCP 工具的页面
3. 在扩展侧面板中点击 **Bridge** 按钮连接
4. AI 客户端即可通过 `webmcp_list_tools` 和 `webmcp_call_tool` 发现和调用浏览器工具

## 安装

### 从 Chrome Web Store 安装

在 [Chrome Web Store](https://chromewebstore.google.com/) 搜索 **WebMCP DevTools** 安装。

### 从源码构建

**前置要求：** Node.js 18+、pnpm

```bash
# 克隆仓库
git clone https://github.com/2019-02-18/WebMCP-DevTools.git
cd WebMCP-DevTools

# 安装依赖
pnpm install

# 构建生产版本
pnpm build
```

在 Chrome 中加载扩展：

1. 打开 `chrome://extensions/`
2. 开启右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `.output/chrome-mv3` 文件夹

### 启用 WebMCP API

使用扩展前，需要先在 Chrome 中启用 WebMCP 标志：

1. 打开 `chrome://flags/#enable-webmcp-testing`
2. 将该标志设为 **Enabled**
3. 重启 Chrome

## 使用方法

1. 点击 Chrome 工具栏中的 **WebMCP DevTools** 图标打开侧面板
2. 导航到任何注册了 WebMCP 工具的页面
3. **Tools** 标签页列出所有检测到的工具及其 Schema
4. 点击工具卡片切换到 **Execute** 标签页
5. 填写参数（表单模式或原始 JSON）并点击 **Execute**
6. 在 **Timeline** 标签页查看实时注册事件
7. 使用 **Snapshots** 保存和对比工具定义

### 本地测试

项目包含一个测试页面 `test/demo.html`，内含多个模拟工具。使用本地服务器（如 VS Code Live Server）打开即可测试，无需真实的 WebMCP 页面。

## 项目结构

```
├── entrypoints/
│   ├── background.ts              # Service Worker — 标签页管理、消息路由
│   ├── content.ts                 # Content Script (ISOLATED) — 与侧面板桥接
│   ├── injected.content.ts        # Content Script (MAIN) — 拦截 modelContext
│   └── sidepanel/
│       ├── index.html             # 侧面板 HTML 外壳
│       ├── main.ts                # 侧面板逻辑 — 渲染、交互
│       └── styles.css             # 所有样式、主题、组件
├── lib/
│   ├── types.ts                   # 共享 TypeScript 接口
│   ├── i18n.ts                    # 国际化（中文 / 英文）
│   ├── icons.ts                   # Lucide 风格 SVG 图标定义
│   ├── theme.ts                   # 主题切换辅助函数
│   ├── storage.ts                 # chrome.storage.local 工具函数
│   ├── export.ts                  # 导出：JSON、Markdown、Postman、TypeScript
│   ├── diff.ts                    # 快照对比引擎
│   ├── schema-renderer.ts        # JSON Schema → 可折叠树形视图
│   ├── schema-form.ts            # JSON Schema → 交互式表单
│   ├── json-highlight.ts         # JSON 语法高亮
│   ├── ai-providers.ts           # AI 多 Provider 适配（Gemini/OpenAI/Claude/DeepSeek）
│   └── markdown.ts               # Markdown 渲染 + 代码语法高亮
├── server/                        # MCP Bridge Server（npm: webmcp-devtools-server）
│   └── src/
│       ├── cli.ts                 # CLI 入口
│       ├── bridge.ts              # WebSocket Bridge 服务
│       └── mcp-server.ts          # MCP stdio 协议服务
├── test/
│   └── demo.html                  # 本地测试页面（含模拟 WebMCP 工具）
├── scripts/
│   └── generate-icons.mjs         # 扩展图标生成脚本
├── public/
│   └── icons/                     # 生成的扩展图标（16–128px）
├── wxt.config.ts                  # WXT 框架配置
├── package.json
├── tsconfig.json
├── PRIVACY.md                     # 隐私政策
└── LICENSE                        # MIT 许可证
```

## 技术栈

- **[WXT](https://wxt.dev/)** — 新一代浏览器扩展框架
- **TypeScript** — 类型安全开发
- **Chrome Manifest V3** — Service Worker、Side Panel API
- **Vanilla DOM** — 无 UI 框架依赖，极小打包体积（~90 KB）

## 开发

```bash
# 启动开发模式（热重载）
pnpm dev

# 构建生产版本
pnpm build

# 打包为 Chrome Web Store 上传用的 zip
pnpm zip
```

## 工作原理

```
                                                                          ┌──────────────┐
                                                                          │  AI 客户端   │
                                                                          │ Cursor/Claude│
                                                                          └──────┬───────┘
                                                                                 │ stdio (MCP)
                                                                          ┌──────┴───────┐
                                                                          │  MCP Bridge  │
                                                                          │   Server     │
                                                                          └──────┬───────┘
                                                                                 │ WebSocket
┌──────────────┐    postMessage     ┌──────────────┐    chrome.runtime     ┌──────┴───────┐
│   网页       │ ←───────────────→  │  Content     │ ←──────────────────→  │  Background  │
│  (MAIN)      │                    │  Scripts     │     .sendMessage      │  (Service     │
│              │                    │  (ISOLATED)  │                       │   Worker)     │
│ modelContext │                    │              │                       │              │
│ .registerTool│                    │              │                       │              │
└──────────────┘                    └──────────────┘                       └──────┬───────┘
                                                                                 │
       ┌──────────────┐                                                          │
       │   侧面板     │ ←────────────────────────────────────────────────────────┘
       │   (UI)       │              chrome.runtime.sendMessage
       │              │
       │ 工具列表     │
       │ 执行面板     │
       │ AI 助手      │
       │ 事件时间线   │
       └──────────────┘
```

1. **injected.content.ts** 运行在页面的 MAIN 世界，通过 monkey-patch `navigator.modelContext.registerTool()` 拦截工具注册
2. **content.ts** 运行在 ISOLATED 世界，桥接 `window.postMessage` ↔ `chrome.runtime.sendMessage`
3. **background.ts**（Service Worker）在 content script 和侧面板之间路由消息，管理标签页追踪
4. **sidepanel/main.ts** 渲染 UI 并协调所有用户交互

## 贡献

欢迎贡献！请提交 Issue 或 Pull Request。

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交更改（`git commit -m 'Add amazing feature'`）
4. 推送分支（`git push origin feature/amazing-feature`）
5. 发起 Pull Request

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

---

<a id="english"></a>

# WebMCP DevTools

A Chrome extension for inspecting, testing, and monitoring [WebMCP]() tools registered via `navigator.modelContext`.

[中文](#webmcp-devtools) | English

![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)

## What is WebMCP?

**Web Model Context Protocol (WebMCP)** is a browser-native API that allows web pages to register tools for AI models through `navigator.modelContext`. WebMCP DevTools gives you a powerful side panel to inspect and interact with these tools in real-time.

## Features

| Feature | Description |
|---------|-------------|
| **Tool Detection** | Automatically detects all WebMCP tools registered on the current page |
| **Declarative WebMCP** | Auto-detects `<form toolname="...">` declarative tools |
| **Cross-Tab Aggregation** | Unified view of tools from all open tabs |
| **MCP Bridge** | Bridge browser tools to Cursor / Claude Desktop via WebSocket |
| **AI Assistant** | Built-in AI panel with Gemini / OpenAI / Claude / DeepSeek, streaming + Markdown |
| **Schema Visualization** | Collapsible tree view with `$ref` / `allOf` / `oneOf` / `anyOf` support |
| **Form Generation** | Auto-generates interactive forms from JSON Schema |
| **Tool Execution** | Execute tools directly from the side panel with instant results |
| **Performance Stats** | Success rate, avg/min/max duration statistics |
| **Unified Execution Log** | Source tracking (Manual / AI Panel / MCP Bridge) |
| **Event Timeline** | Track tool register / unregister / change events in real-time |
| **Execution History** | Review recent executions with full input & output details |
| **Snapshots & Diff** | Save tool definition snapshots and compare changes over time |
| **Export** | Export as JSON, Markdown, Postman Collection, or TypeScript code |
| **i18n** | English and Chinese (中文) with one-click toggle |
| **Themes** | System-aware dark / light theme with manual override |

## MCP Bridge Integration

WebMCP DevTools can bridge browser tools to external AI clients (Cursor, Claude Desktop, etc.).

### Install MCP Server

```bash
npm install -g webmcp-devtools-server
```

### Cursor Configuration

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server"]
    }
  }
}
```

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server"]
    }
  }
}
```

### Usage

1. Start your AI client (Cursor / Claude Desktop)
2. Open a page with WebMCP tools in the browser
3. Click the **Bridge** button in the extension's side panel
4. The AI client can now discover and call browser tools via `webmcp_list_tools` and `webmcp_call_tool`

## Installation

### From Chrome Web Store

Search for **WebMCP DevTools** on the [Chrome Web Store](https://chromewebstore.google.com/).

### From Source

**Prerequisites:** Node.js 18+, pnpm

```bash
# Clone the repository
git clone https://github.com/2019-02-18/WebMCP-DevTools.git
cd WebMCP-DevTools

# Install dependencies
pnpm install

# Build for production
pnpm build
```

Then load the extension in Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` folder

### Enable WebMCP API

Before using the extension, enable the WebMCP flag in Chrome:

1. Open `chrome://flags/#enable-webmcp-testing`
2. Set the flag to **Enabled**
3. Restart Chrome

## Usage

1. Click the **WebMCP DevTools** icon in the Chrome toolbar to open the side panel
2. Navigate to any page that registers WebMCP tools
3. The **Tools** tab lists all detected tools with their schemas
4. Click a tool card to switch to the **Execute** tab
5. Fill in parameters (form mode or raw JSON) and click **Execute**
6. Check the **Timeline** tab for real-time registration events
7. Use **Snapshots** to save and diff tool definitions over time

### Local Testing

A test page is included at `test/demo.html` with several mock tools. Open it with a local server (e.g. VS Code Live Server) to try the extension without needing a real WebMCP-enabled site.

## Project Structure

```
├── entrypoints/
│   ├── background.ts              # Service Worker — tab tracking, message routing
│   ├── content.ts                 # Content Script (ISOLATED) — bridge to side panel
│   ├── injected.content.ts        # Content Script (MAIN) — intercepts modelContext
│   └── sidepanel/
│       ├── index.html             # Side Panel HTML shell
│       ├── main.ts                # Side Panel logic — rendering, interactions
│       └── styles.css             # All styles, themes, components
├── lib/
│   ├── types.ts                   # Shared TypeScript interfaces
│   ├── i18n.ts                    # Internationalization (en / zh)
│   ├── icons.ts                   # Lucide-style SVG icon definitions
│   ├── theme.ts                   # Theme application helpers
│   ├── storage.ts                 # chrome.storage.local utilities
│   ├── export.ts                  # Export: JSON, Markdown, Postman, TypeScript
│   ├── diff.ts                    # Snapshot diff engine
│   ├── schema-renderer.ts        # JSON Schema → collapsible tree view
│   ├── schema-form.ts            # JSON Schema → interactive form
│   ├── json-highlight.ts         # JSON syntax highlighter
│   ├── ai-providers.ts           # Multi-provider AI adapter (Gemini/OpenAI/Claude/DeepSeek)
│   └── markdown.ts               # Markdown rendering + code syntax highlighting
├── server/                        # MCP Bridge Server (npm: webmcp-devtools-server)
│   └── src/
│       ├── cli.ts                 # CLI entry point
│       ├── bridge.ts              # WebSocket Bridge service
│       └── mcp-server.ts          # MCP stdio protocol server
├── test/
│   └── demo.html                  # Local test page with mock WebMCP tools
├── scripts/
│   └── generate-icons.mjs         # Extension icon generator
├── public/
│   └── icons/                     # Generated extension icons (16–128px)
├── wxt.config.ts                  # WXT framework configuration
├── package.json
├── tsconfig.json
├── PRIVACY.md                     # Privacy policy
└── LICENSE                        # MIT License
```

## Tech Stack

- **[WXT](https://wxt.dev/)** — Next-gen Web Extension Framework
- **TypeScript** — Type-safe development
- **Chrome Manifest V3** — Service Worker, Side Panel API
- **Vanilla DOM** — No UI framework dependency, minimal bundle size (~90 KB)

## Development

```bash
# Start dev mode with hot reload
pnpm dev

# Build for production
pnpm build

# Package as zip for Chrome Web Store
pnpm zip
```

## How It Works

```
                                                                          ┌──────────────┐
                                                                          │  AI Client   │
                                                                          │ Cursor/Claude│
                                                                          └──────┬───────┘
                                                                                 │ stdio (MCP)
                                                                          ┌──────┴───────┐
                                                                          │  MCP Bridge  │
                                                                          │   Server     │
                                                                          └──────┬───────┘
                                                                                 │ WebSocket
┌──────────────┐    postMessage     ┌──────────────┐    chrome.runtime     ┌──────┴───────┐
│  Web Page    │ ←───────────────→  │   Content    │ ←──────────────────→  │  Background  │
│  (MAIN)      │                    │   Scripts    │     .sendMessage      │  (Service     │
│              │                    │  (ISOLATED)  │                       │   Worker)     │
│ modelContext │                    │              │                       │              │
│ .registerTool│                    │              │                       │              │
└──────────────┘                    └──────────────┘                       └──────┬───────┘
                                                                                 │
       ┌──────────────┐                                                          │
       │  Side Panel  │ ←────────────────────────────────────────────────────────┘
       │  (UI)        │              chrome.runtime.sendMessage
       │              │
       │ Tools list   │
       │ Execute      │
       │ AI Assistant │
       │ Timeline     │
       └──────────────┘
```

1. **injected.content.ts** runs in the page's MAIN world, monkey-patches `navigator.modelContext.registerTool()` to intercept tool registrations
2. **content.ts** runs in ISOLATED world, bridges `window.postMessage` ↔ `chrome.runtime.sendMessage`
3. **background.ts** (Service Worker) routes messages between content scripts and the side panel, manages tab tracking
4. **sidepanel/main.ts** renders the UI and orchestrates all user interactions

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the [MIT License](LICENSE).
