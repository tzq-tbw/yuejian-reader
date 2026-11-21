# 英语精读 · 阅间

Windows 桌面精读应用（阶段 1：本机阅读骨架）。React + TypeScript + Tauri 2 + SQLite，视觉基准沿用 `reader-preview/` 的已确认样品。当前阶段支持粘贴建篇、资料库、阅读分区、正文编辑保存和双侧栏收起。

## 桌面版启动

前置环境：Node.js 22.12 或更新版本（Vitest 5 的要求；本机实测 24.22.1）、Rust stable，以及 Visual Studio 生成工具中的“使用 C++ 的桌面开发”工作负载；Windows 11 自带 WebView2 运行时。首次拉取代码后安装前端依赖：

~~~powershell
npm install
~~~

开发启动（Tauri 会同时拉起 Vite，固定端口 1420）：

~~~powershell
npm run tauri:dev
~~~

只想查看界面时，可在普通浏览器运行 `npm run dev` 并访问 http://localhost:1420/ 。浏览器模式使用 localStorage 中的本地模拟库（初始为空，默认分区为“我的阅读”），不写入 SQLite，仅用于预览和测试。模拟数据保存在 localStorage 键 `yuejian.browser.db`；删除该键即可重置。

构建前端与安装包：

~~~powershell
npm run build
npm run tauri:build
~~~

安装包输出在 `src-tauri/target/release/bundle/nsis/`。阶段 1 只在开发窗口验证；安装包构建属于阶段 5。

## 数据与测试

- 正式数据由 Rust 命令写入 SQLite，数据库位于 Tauri 应用数据目录（Windows 通常为 `%APPDATA%\com.yuejian.reader\reader.db`）。
- 迁移脚本在 `src-tauri/migrations/`，启动时按版本执行；已有文章会由第 2 个迁移补入默认分区“我的阅读”，且只执行一次。
- 前端测试：`npm test`
- Rust 数据库测试：在 `src-tauri/` 运行 `cargo test`

## 目录

| 目录 | 职责 |
|---|---|
| `src/library` | 资料库、粘贴建篇、主题分类、文章编辑入口 |
| `src/reading-list` | 分区列表、重命名、文章加入/移除入口 |
| `src/reader` | 正文渲染、编辑保存、精读侧栏 |
| `src/data` | 类型、文本分段、Tauri 命令封装、浏览器预览实现 |
| `src-tauri/migrations` | SQLite 表结构与版本迁移 |
| `src-tauri/src` | Tauri 桌面壳、数据库命令与测试 |

## 回归基线（Python 网页端）

`backend/`、`frontend/` 与根目录 `reader.sqlite3` 是迁移前的行为基线，本阶段不改动。需要对照旧行为时，在项目目录打开 PowerShell：

~~~powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
~~~

访问 http://127.0.0.1:8000/ ，接口文档在 http://127.0.0.1:8000/docs 。启用翻译与解析时，在同一个 PowerShell 窗口设置 DeepSeek Key：

~~~powershell
$env:DEEPSEEK_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'DeepSeek API Key' -AsSecureString)).Password
~~~

可用 `DEEPSEEK_MODEL` 选择模型。网页端的划词、翻译、收藏与复习逻辑作为后续阶段回归依据，不属于桌面版阶段 1 范围。旧代码入口见《代码地图.md》。