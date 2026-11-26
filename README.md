# 英语精读 · 阅间

Windows 桌面英语精读应用。支持真题 PDF 导入、划词和句法解析、收藏复习、作文批改。桌面端使用 React、TypeScript、Tauri 2 和 SQLite。

## 安装 Windows 版

从 [GitHub Releases](https://github.com/tzq-tbw/yuejian-reader/releases/latest) 下载 `Yuejian-0.1.0-x64-setup.exe`，双击按提示安装。适用于 x64 Windows。缺少 WebView2 运行时时，安装程序会联网获取。

首次使用 AI 时，在设置中配置本机代理或自己的模型服务。Windows 桌面版通过凭据管理器保存 API Key。安装版启动时会检查更新，也可在设置里点“检查更新”。更新由 Tauri 核验安装包签名后安装。

调用流程和答辩演示见 [桌面 AI 调用学习与展示](work/桌面AI调用学习与展示.md)。

内置考试词表由 [ECDICT 固定版本](https://github.com/skywind3000/ECDICT/tree/39cfb9672c0906b63569e0453c2e6abfb9ab182a)筛选整理，许可随安装包发布。 [ECDICT 许可](src-tauri/wordlists/ECDICT-LICENSE.txt)

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

安装包输出在 `src-tauri/target/release/bundle/nsis/`。发布者可运行 `pwsh -NoProfile -File scripts/build-windows.ps1` 生成签名安装包、签名及 `latest.json`。脚本从签名环境变量或当前 Windows 用户的签名目录取密钥。验收命令和实测记录见 [阶段 5 交付记录](work/CHANGES-T005.md)。

## 精读模型接入（阶段 3）

- 默认经本机 Magpie 代理访问 DeepSeek：`http://127.0.0.1:3425/v1`，模型 `auto/deepseek-v4.1-flash`（OpenAI 兼容格式）；桌面端模型请求由 Rust `model_chat` 命令发出，避开 WebView 的 CORS 限制。
- 可在设置中修改服务地址、模型和 API Key。构建时也可通过 `VITE_LANGUAGE_BASE_URL`、`VITE_LANGUAGE_MODEL` 修改默认地址和模型。
- 浏览器预览的 `fetch` 通道受代理 CORS 限制，模型功能以桌面版为准；断网或代理未启动时只影响侧栏结果，不阻断本地编辑。
- 真实联调（需 Magpie 已启动）：`YUEJIAN_REAL_MODEL=1 npx vitest run src/language/realModel.test.ts --reporter=verbose`。Rust 通道可运行 `cargo test model_chat_round_trip -- --ignored`。

## 数据与测试

- 正式数据由 Rust 命令写入 SQLite，数据库位于 Tauri 应用数据目录（Windows 通常为 `%APPDATA%\com.yuejian.reader\reader.db`）。
- 迁移脚本在 `src-tauri/migrations/`，启动时按版本执行；已有文章会由第 2 个迁移补入默认分区“我的阅读”，且只执行一次。
- 前端测试：`npm test`
- Rust 数据库测试：在 `src-tauri/` 运行 `cargo test`

## 目录

| 目录 | 职责 |
|---|---|
| `src/library` | 资料库、粘贴建篇、主题分类、文章编辑入口 |
| `src/import` | PDF.js 文字层提取、四级阅读拆篇、导入预览与指纹去重 |
| `src/language` | 模型客户端、提示词与响应解析、选区请求目标、四级词表样例、精读侧栏会话 |
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
