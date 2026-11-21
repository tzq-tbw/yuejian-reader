# T-001 改动清单 · 阶段 1 本机阅读骨架

| 项 | 内容 |
|---|---|
| 任务 | T-001：Tauri 2 桌面壳 + SQLite 迁移 + 粘贴建篇 + 分区/资料库选择器 + 列表与正文 + 编辑保存 + 双侧栏收起 |
| 基线 | `1f5ca40`（`chore: 建立项目基线`） |
| 分支 | `master` |
| 完成日期 | 2026-11-21 |
| 当前状态 | 代码完成，工作区改动尚未提交，待审查与实机验收 |
| 本机验证 | `npm run build` 通过；`npm test` 8/8 通过。`cargo test` 与 Tauri 窗口启动待 MSVC `link.exe` 环境就绪后执行 |

## 1. 改动范围

### 1.1 新增文件与目录

| 路径 | 内容 |
|---|---|
| `package.json`、`package-lock.json` | 前端依赖与脚本；新增 `dev`、`build`、`preview`、`test`、`tauri:dev`、`tauri:build` 等入口 |
| `tsconfig.json`、`vite.config.ts`、`index.html` | TypeScript 严格模式、Vite/Vitest 配置（固定端口 1420、jsdom 测试环境）、页面入口 |
| `src/main.tsx`、`src/base.css`、`src/styles.css`、`src/testSetup.ts` | React 挂载、全局样式与测试初始化 |
| `src/App.tsx`、`src/App.test.tsx` | 工作台状态编排、加载/保存/切换逻辑、导航与三个对话框的挂载；UI 集成测试 |
| `src/data/` | `types.ts` 定义 `ReaderApi` 与领域类型；`tauriApi.ts` 封装 Tauri 命令；`mock.ts` 提供 localStorage 浏览器实现；`text.ts` 负责分段、词数、主题分类；`index.ts` 按运行环境选择实现；`mock.test.ts` 覆盖数据层 |
| `src/library/` | `LibraryPage.tsx` 资料库、搜索与文章操作；`PasteDialog.tsx` 粘贴建篇；`LibraryPicker.tsx` 从资料库多选加入分区；`ArticleEditDialog.tsx` 资料库内编辑文章 |
| `src/reading-list/` | `SectionList.tsx` 分区/文章列表、折叠、菜单、移除；`SectionNameDialog.tsx` 新建/重命名分区 |
| `src/reader/` | `ReaderView.tsx` 正文与工具栏、空态；`ArticleEditor.tsx` 正文编辑与草稿状态；`Inspector.tsx` 右侧文章信息栏 |
| `src/components/` | `Modal.tsx`、`PopoverMenu.tsx`、`IconButton.tsx`、`ArticleDraftFields.tsx`；包含焦点恢复、Esc 关闭、Tab 圈定与键盘菜单 |
| `src/utils/error.ts` | 统一错误消息提取 |
| `src-tauri/Cargo.toml`、`Cargo.lock`、`build.rs` | Tauri 2 应用包与锁定依赖；`tauri`、`rusqlite`（bundled）、`serde`、`uuid` |
| `src-tauri/tauri.conf.json` | 窗口 1280×840（最小 720×540）、固定开发地址 1420、NSIS 打包配置 |
| `src-tauri/capabilities/default.json`、`src-tauri/icons/` | 主窗口权限与桌面图标 |
| `src-tauri/src/main.rs`、`lib.rs`、`db.rs` | 桌面进程入口；11 个 Tauri 命令与数据库状态；SQLite 打开、迁移、查询、写入和测试 |
| `src-tauri/migrations/0001_core.sql`、`0002_default_section.sql` | 核心表结构与默认分区/旧文章回填迁移 |
| `scripts/make-icons.mjs` | 用 Node 内置 zlib 生成占位应用图标（深蓝底 + 白色书本），不依赖图像库 |
| `work/CHANGES-T001.md` | 本改动清单 |

`src/` 共 26 个文件（16 个 `.tsx`、8 个 `.ts`、2 个 `.css`）。

### 1.2 修改的已有文件

| 路径 | 改动 |
|---|---|
| `README.md` | 首页从旧网页端启动说明改为桌面版启动、构建、数据位置与测试说明；保留 Python 网页端回归基线；补充 Node.js 22.12+ 要求、浏览器预览地址及 localStorage 重置方式 |
| `.gitignore` | 增加 `src-tauri/gen/` 与 `src-tauri/.cargo/` |
| `项目方案.md` | 仅“准备 · 项目目录与 Git”进度行记录基线信息，不含产品行为改动 |

### 1.3 未改动（回归基线）

`backend/`、`frontend/`、根目录 `reader.sqlite3`、`reader-preview/` 均未修改，仍作为旧网页端行为和视觉样品基线。`git diff --stat` 中已跟踪文件的改动只有 `README.md`、`.gitignore`、`项目方案.md`。

### 1.4 主要实现内容

**数据层。** 启动时在 Tauri 应用数据目录创建 `reader.db`，启用 WAL、外键和 5 秒忙等待。`schema_migrations` 按版本记录迁移：`0001_core.sql` 建立 `suites`、`articles`、`reading_sections`、`section_articles`；`0002_default_section.sql` 建立默认分区“我的阅读”，并按文章 ID 回填一次旧文章。迁移在事务中执行，重复启动不会重复回填，也不会重新加回已移除的文章。

**命令层。** `src-tauri/src/lib.rs` 提供 11 个命令，与 `src/data/types.ts` 的 `ReaderApi` 一一对应：`list_sections`、`create_section`、`rename_section`、`list_section_articles`、`list_library`、`get_article`、`paste_article`、`update_article`、`add_articles_to_section`、`remove_article_from_section`、`get_article_sections`。连接由 `Mutex` 保护，命令层只做参数转发。

**写入规则。** 粘贴在一个事务内创建文章并加入排序最靠前的分区；标题/正文为空会被前端和 Rust 双侧拒绝。编辑会规范化空白、写入新标题/主题/段落，并将 `version` 加 1；提交携带 `expectedVersion`，版本不一致返回“正文已在其他位置更新”。批量加入分区在事务内去重，移除只删除 `section_articles` 成员记录，不动文章原件、其他分区、收藏或复习数据（后两者尚未在本阶段实现）。

**前端。** `getApi()` 通过 `__TAURI_INTERNALS__` 判断运行环境：桌面窗口走 Tauri 命令，普通浏览器走 `createMockApi(window.localStorage)`。两者保持相同语义，包括段落拆分、版本冲突、分区去重和持久化。界面包含阅读工作台与资料库两个视图、分区折叠/新建/重命名、资料库搜索、单选/多选加入分区、粘贴建篇、正文编辑保存、文章信息侧栏，以及左右侧栏独立收起；侧栏开合与上次选中项保存在 localStorage（`yuejian.ui`、`yuejian.last`），正文与分区数据保存在 SQLite（浏览器预览为 `yuejian.browser.db`）。

## 2. 如何启动

### 2.1 前置环境

- Node.js 22.12 或更新版本（Vitest 5 要求；本机实测 24.22.1）与 npm。
- Rust stable（`Cargo.toml` 最低 1.77.2；本机实测 1.98.1）。
- Visual Studio 生成工具中的“使用 C++ 的桌面开发”工作负载，包含 MSVC 与 Windows SDK；Rust 链接需要 `link.exe`。
- Windows 11 自带 WebView2 运行时。

当前机器缺少 MSVC `link.exe`，因此 `cargo test`、`npm run tauri:dev` 和 `npm run tauri:build` 的链接阶段暂时无法执行；负责人正在安装 VS Build Tools。该环境问题不属于本任务代码范围。

### 2.2 开发启动

在项目根目录打开 PowerShell：

```powershell
npm install
npm run tauri:dev
```

`tauri dev` 会先执行 `npm run dev` 拉起 Vite（固定端口 1420），再编译 Rust 并打开标题为“阅间 · 英语精读”的桌面窗口。首次编译需要下载并构建 Rust 依赖，时间明显长于后续启动。

首次启动会自动创建数据库并执行迁移，位置为：

```text
%APPDATA%\com.yuejian.reader\reader.db
```

启动后默认分区为“我的阅读”。若 `link.exe` 仍缺失，`tauri:dev` 会在 Rust 链接阶段失败；此时可先用第 5 节的浏览器预览检查界面，待 VS Build Tools 安装完成后再做桌面实机验收。

## 3. 如何构建

### 3.1 前端构建

```powershell
npm run build
```

该脚本先执行 `tsc --noEmit` 做 TypeScript 类型检查，再由 Vite 构建到 `dist/`。本机 2026-11-21 复跑通过：Vite 用时约 1.56 s，产物 `index-C62oOe54.js` 299.88 kB（gzip 93.64 kB）、`index-Bh8-WA1Z.css` 122.84 kB（gzip 20.09 kB）。负责人早前也已实测通过（约 6.4 s）。

### 3.2 桌面安装包

```powershell
npm run tauri:build
```

该命令构建前端、编译 release 版 Rust，并生成 NSIS 安装包，输出目录：

```text
src-tauri/target/release/bundle/nsis/
```

安装包构建属于阶段 5；当前受 MSVC 环境限制尚未执行，也未在独立 Windows 用户环境安装验证。

## 4. 如何跑测试

### 4.1 前端测试

```powershell
npm test
```

本机结果：2 个测试文件、8 个用例全部通过（约 4.99 s）。

| 文件 | 用例数 | 覆盖内容 |
|---|---:|---|
| `src/data/mock.test.ts` | 5 | 三段粘贴生成一张卡并进入默认分区；标题/正文空输入拒绝；同一文章加入两个分区、重复添加只保留一条、移除不删原件；编辑版本加 1 与旧版本冲突；同一存储重新实例化后数据仍在 |
| `src/App.test.tsx` | 3 | 资料库粘贴建篇 → 阅读 → 改第二段 → 保存 → 双栏独立收起/展开 → 模拟重启后修改仍在；新建分区、多选加入、已添加不可重复勾选、移除只影响当前分区且资料库仍在；关闭对话框后焦点回到发起按钮 |

UI 测试使用 mock API 和 jsdom，验证的是界面语义；“重启”通过在同一 storage 上重新挂载 `App` 模拟，真实 Tauri 进程重启与 SQLite 数据保留仍待实机验收。

### 4.2 Rust 数据库测试

```powershell
cd src-tauri
cargo test
```

源码中共 10 个 `#[test]`：新库默认分区、旧库升级回填且不重复回填、三段粘贴与默认分区、空输入拒绝、编辑版本递增与冲突、跨分区加入/去重/移除保留原件、分区名称去空白与非空校验、资料库搜索分组、关键词主题分类、无空行粘贴按行分段。

当前机器缺少 MSVC `link.exe`，该命令尚未执行，因此不能记作已通过；待 VS Build Tools 安装完成后，在 `src-tauri/` 目录运行上述命令并记录结果。

## 5. 浏览器预览模式

只检查界面或做前端调试时，不需要 Rust、WebView2 或 SQLite：

```powershell
npm run dev
```

访问 http://localhost:1420/ 。此时 `__TAURI_INTERNALS__` 不存在，`getApi()` 会使用 `createMockApi(window.localStorage)`：

- 初始为空资料库，只有一个默认分区“我的阅读”；可完整走粘贴、编辑、分区、资料库、双栏收起流程。
- 模拟数据保存在 localStorage 键 `yuejian.browser.db`，刷新或重新打开页面后仍在；侧栏状态在 `yuejian.ui`，上次选中项在 `yuejian.last`。
- 不读写 SQLite，不调用 Tauri 命令，也不产生 `%APPDATA%` 下的数据库。
- 重置模拟数据：浏览器开发者工具 → Application → Local Storage → 删除 `yuejian.browser.db`（如需连界面状态一起重置，再删除另外两个键）；也可以在控制台执行 `localStorage.removeItem("yuejian.browser.db")`。
- 浏览器预览只用于界面和前端逻辑检查；阶段 1 的持久化验收应以 Tauri 窗口 + SQLite 为准。

## 6. 已知限制

- 阶段范围：仅实现本机阅读骨架。PDF 导入（阶段 2）、划词/翻译/解析（阶段 3）、收藏与复习（阶段 4）尚未接入；右侧栏目前只展示文章信息，不是精读结果栏。
- 资料库只有粘贴入口，没有从资料库删除文章、导出/备份或恢复功能；没有批量管理。
- 分区支持新建、重命名、加入、移除、折叠；没有删除分区、拖拽排序、手动调整文章顺序。
- 资料库搜索仅按标题过滤；主题分类是本地关键词匹配，未命中归“未分类”，没有 AI 分类；主题可在粘贴/编辑时手动填写。
- 正文编辑统一把段内空白折叠为单个空格，段与段之间用空行分隔；这是当前实现约定，不做原样保留排版。
- 浏览器预览的数据只在 localStorage，清除站点数据会丢失，不能替代正式数据；桌面端正文/分区/资料库在 SQLite，侧栏开合和上次选中项仍只是 WebView 本地偏好。
- Tauri 窗口启动、SQLite 真实重启保留、10 个 Rust 用例尚未在本机执行，原因是缺少 MSVC `link.exe`；前端构建与 8 个前端用例已通过。
- NSIS 安装包尚未构建，也未在独立 Windows 用户环境安装验证；按方案属于阶段 5。
- Tauri 配置中的 CSP 目前为 `null`，后续安全加固时再收紧；当前阶段不访问外部网络。
- 单窗口应用，未实现多窗口共享数据库；Tauri 命令层没有独立集成测试，数据库层由 Rust 单元测试覆盖。

## 7. 待实机验收路径

待 VS Build Tools 安装完成、`npm run tauri:dev` 能打开窗口后，按方案阶段 1 通过条件执行并记录结果：

1. 粘贴三段英文，确认只生成一张卡、保留三段，并自动加入“我的阅读”；标题或正文为空时不建卡。
2. 修改第二段并保存，切换到其他文章再切回，关闭并重启应用，确认修改仍在且版本号增加。
3. 分别收起、展开文章列表与精读侧栏，确认正文仍可阅读和编辑，恢复按钮可用。
4. 新建“本周精读”和“下周再读”，把同一篇文章加入两个分区；重复打开选择器应显示“已添加”。重命名一个分区并重启，确认名称、成员和顺序保留；在一个分区编辑正文，另一个分区读取同一版本；从其中一个分区移除后，资料库和另一个分区仍可打开该文章；清空分区显示空态。
5. 在浏览器预览重复关键界面路径，确认与桌面端行为一致（数据不互通，属预期）。

## 8. 提交与工作区状态

当前改动尚未提交。待审查/验收通过后，按方案要求暂存 `src/`、`src-tauri/`（不含 `target/`）、`package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`scripts/`、`.gitignore`、`README.md`、`work/CHANGES-T001.md`，核对 `git diff --cached --stat` 后再提交；`backend/`、`frontend/`、`reader-preview/` 和根目录数据库不进入本次改动。