# R5 四项迭代反审记录

反审日期：2026-11-22。依据 `work/CHANGES-R5.md`、R5 任务说明与当前工作区代码，只读核对；未修改产品代码。独立执行了 `npm test`、`cargo test`、`npm run build`、`cargo check`，并额外做了词表逐项比对与 WAL 模式下 `VACUUM INTO` 验证。

## 结论

| 核验项 | 结论 |
|---|---|
| 1 导出链路（插件/权限/CSV/旧按钮） | 通过 |
| 2 设置页四功能（备份/删除/双重确认/更新占位） | 通过 |
| 3a 词表迁移、种子、删除语义 | 通过 |
| 3b `listWords(undefined)/([])` 双端语义 | 通过 |
| 3c 选择器多选持久化与 vocabulary 匹配接线 | 通过 |
| 3d 选择器视觉呈现 | **不通过** |
| 4 作文批改（提示词/解析/迟到隔离/不落库） | 通过（有 1 项测试缺口） |
| 5 跨模块回归与命令注册 | 通过（有 2 项非阻断观察） |

总体：数据、命令和页面接线均可成立，未发现数据损坏、命令遗漏或阶段 3 划词回归。但词表选择器存在一项必修的 CSS 级联缺陷：默认三表全选时，选中项的词表名称会以白字显示在浅蓝底上而不可见。建议修复该项后再交负责人实机验收；其余为测试覆盖和双端细节观察。

## 1. 导出链路 —— 通过

- **插件安装与注册齐全。** `package.json:19-20` 安装 `@tauri-apps/plugin-dialog` 2.8.4、`@tauri-apps/plugin-fs` 2.7.1；`src-tauri/Cargo.toml:18-19` 引入两个 Rust 插件；`src-tauri/src/lib.rs:327-328` 在 Builder 上初始化。`src-tauri/capabilities/default.json:6-13` 同时授予 `dialog:default`、`dialog:allow-open`、`dialog:allow-save`、`fs:default`、`fs:allow-read-text-file`、`fs:allow-write-text-file`。目标窗口为 `main`（`src-tauri/tauri.conf.json`），与 capability 的 `windows` 一致；生成的能力 schema 中也存在这些 permission 标识。
- **运行时 scope 闭合。** `fs:default` 只覆盖应用目录并带 `deny-default`，真正让用户任选路径可读写的是 dialog 插件：`tauri-plugin-dialog-2.8.4/src/commands.rs` 的 `open`/`save` 在返回路径后调用 `try_fs_scope().allow_file(...)`。因此 `save → writeTextFile`、`open → readTextFile` 不仅权限标识齐全，运行时 scope 也会被补上。插件注册顺序为先 dialog 后 fs，但 scope 在命令执行时查找，不影响。
- **桌面路径不再走 Blob 下载。** `src/data/files.ts:65-87` 在 Tauri 运行时使用 `save` 选路径、`writeTextFile` 写 UTF-8 内容；`browserDownload` 仅在非 Tauri 预览环境保留（`files.ts:19-30`）。`files.test.ts:15-28` 验证了取消不写、确认后调用 `writeTextFile`。
- **Rust 与 mock 的 CSV 语义一致。** Rust `settings.rs:17-57` 只查 `word/part_of_speech/common_meaning`，按 `created_at DESC, id DESC`，写 UTF-8 BOM、`CRLF`、全部字段加引号并转义双引号，`common_meaning` 取第一个 `;`/`；`/换行片段。mock 的 `wordExport.ts:3-21` 使用相同规则，`mock.ts:904-907` 复用 `listWordFavorites` 的倒序结果。Rust 用例 `settings.rs:117-142` 用包含逗号和双引号的单词实际落盘，断言 BOM、CRLF、转义及不包含语境义/长难句；`SettingsPage.test.tsx:22-57` 对 mock 做了同字段断言。
- **收藏页旧按钮已移除。** `CollectionPage.tsx` 头部只剩刷新按钮（`176-192`），全文件没有导出按钮或 Blob 下载；导出入口只有设置页 `SettingsPage.tsx:65-70, 137-142`。
- 边界：本次未打开真实桌面窗口点一次保存对话框；已用能力配置、插件源码、Rust/mock 测试和 `npm run build`、`cargo check` 核验。Kimi 交付说明所称的 debug 可执行文件存在于 `src-tauri/target/debug/yuejian.exe`（时间晚于本轮源码修改），与构建成功一致。

## 2. 设置页四功能 —— 通过

- **`VACUUM INTO` 备份一致性成立。** `settings.rs:59-76` 先拒绝空路径和已存在目标，再检查父目录，最后执行 `VACUUM INTO ?1`；SQLite 会在读事务快照上生成单文件副本。`settings.rs:144-163` 实际生成备份、重开 SQLite 并读回文章；另用 SQLite 3.50 在 WAL 模式、连接保持打开且存在 WAL 文件的场景独立验证，备份中包含全部已提交行。
- **`delete_all_data` 事务范围完整且保留迁移记录。** `settings.rs:78-98` 在单个事务内删除 `review_events`、`review_schedules`、`word_favorites`、`long_sentence_favorites`、`section_articles`、`reading_sections`、`articles`、`suites`、`wordlist_words`、`wordlists`，并清空 `sqlite_sequence`；`schema_migrations` 未触碰。`settings.rs:165-199` 断言上述业务表全空且迁移数仍为 5。删除顺序符合外键关系，失败时事务回滚。
- **双重确认成立。** `SettingsPage.tsx:242-262` 使用两阶段弹窗，第一段为“确认清空所有数据？”，第二段为“最后确认”，删除按钮只在第二段出现；`SettingsPage.test.tsx:110-129` 验证两段确认后才调用 `onDataDeleted`，并断言分区、词表、收藏与资料库均已空。
- **更新占位成立。** `SettingsPage.tsx:207-218` 显示 0.1.0，检查更新按钮提示阶段 5 接入；测试 `SettingsPage.test.tsx:59-76` 覆盖。
- 非阻断观察 1：删除后 Rust 不再有默认分区（`reading_sections` 被清空，迁移 0002 不会重跑），粘贴文章仍可在资料库的“单篇材料”看到，但不会自动加入阅读分区，需要用户新建分区。若“删除数据”期望回到首次启动状态，需要在删除事务末尾补建默认分区，或明确这是产品预期。
- 非阻断观察 2：浏览器 mock 的 `deleteAllData` 立即状态下也是空分区（`mock.ts:916-923`），但 `createMockApi` 在重载时只要分区数组为空就会补回默认分区（`mock.ts:289`）；桌面端不会补回。这使“删除后重载”的双端行为不一致。当前只影响浏览器预览；建议在 mock 中区分为“首次初始化”和“用户清空”。
- 非阻断观察 3：浏览器 mock 的 `backupDatabase` 只是把状态 JSON 写进 localStorage（`mock.ts:909-914`），并非 SQLite 备份；`files.backupDatabase` 在非 Tauri 环境直接报错（`files.ts:77-87`），正常 UI 不会走到 mock 备份，故不构成桌面功能问题。

## 3. 词表管理

### 3a 迁移种子与 `wordlists/*.ts` 一致性 —— 通过

- 用 Node 脚本按 `src/language/wordlists/cet4.ts`、`cet6.ts`、`postgraduate.ts` 的数组顺序与 `src-tauri/wordlists/cet4.txt`、`cet6.txt`、`ky.txt` 逐项比较：三库均为 **1600/1600**，顺序逐项相等，库内无重复；映射 `postgraduate.ts → ky.txt` 正确。
- `0005_wordlists.sql:1-23` 建立两表、主键 `(list_id, word)`、级联删除和三张内置表的名称/来源；`db.rs:268-271` 注册迁移，`db.rs:303-305` 在迁移 5 的同一事务中调用 `seed_builtin_wordlists`；`wordlists.rs:39-55` 按文件顺序写 `position`。任何一步失败都会随事务回滚。
- mock 默认三表的数据与名称/来源也与迁移一致（`mock.ts:192-220`）。

### 3b 已删除内置表不复活 —— 通过

- `run_migrations` 先查 `schema_migrations` 再执行，迁移 5 不会重跑；`wordlists.rs:247-265` 的测试实际删除 `cet4` 后再次 `run_migrations`，断言只剩 2 张表。`delete_all_data` 保留迁移记录也避免了重启后种子重灌。
- mock 侧持久化状态中的 `wordlists` 若为数组就原样保留（`mock.ts:296`），删除内置表后重载不会重新生成；但没有对应自动化用例，属于测试缺口而非当前逻辑错误。

### 3c `listWords(undefined)/([])` 与选择器接线 —— 通过

- Rust `wordlists.rs:143-173`：`Some(vec![])` 立即返回空数组；`None` 只取启用表；指定 ID 与启用状态取交集，已删除/禁用表不参与。mock `mock.ts:932-939` 同语义；`tauriApi.ts:70` 将 `undefined` 显式转为 `null`，让 Rust 收到 `None`。
- 阅读页先加载启用词表（`ReaderView.tsx:99-112`），再从 localStorage 读选择并过滤合法/启用 ID（`wordlistSelection.ts:3-14`），最后 `api.listWords(selectedListIds)` 并用返回词表构造 `createVocabularyList`（`ReaderView.tsx:114-128`、`vocabulary.ts:47-60`），正文按命中类别输出 `mark`（`ReaderView.tsx:278-296`）。
- `VocabularySelector.test.tsx:10-65` 覆盖默认三表全选、自由多选、全部取消、空选择持久化和卸载重开保留；`SettingsPage.test.tsx:78-108` 覆盖导入后词表可见、词数正确及 `listWords()` 返回自定义表。选择键为 `yuejian.vocabulary.selected`，与交付说明一致。

### 3d 选择器视觉呈现 —— 不通过（必修 UI 缺陷）

- 结构上菜单位于 `.toolbar` 内：`ReaderView.tsx:203-210` → `VocabularySelector.tsx:38-75`。菜单项是普通 `<button>`，没有 `.markToggle` 或 `.icon` 类。
- 全局工具栏规则 `styles.css:191-196` 为 `.toolbar button:not(.markToggle):not(.icon)`，特异性 (0,3,1)，设置了蓝色背景、白字、`5px 12px` 内边距、蓝色边框和 9px 圆角。新增规则 `styles.css:1286` 的 `.toolbar .vocabularyMenu button` 特异性只有 (0,2,1)，冲突属性全部输给全局规则。
- 更关键的是 `styles.css:1287`：`.toolbar .vocabularyMenu button:hover, .toolbar .vocabularyMenu button[aria-checked="true"]` 特异性为 (0,3,1)，与全局规则相同且位于后面，因此**背景**变成 `#edf3fc`；但该规则没有重新声明 `color`，文字仍是全局规则的白字。用完整 `src/styles.css` 及生产构建后的 `dist/assets/index-DYFHMUZt.css` 在 headless Chrome 中分别实测，选中项均为 `background: rgb(237, 243, 252); color: rgb(255, 255, 255)`，未选中项为蓝底白字，内边距为 `5px 12px`。
- 影响：默认三表全选时，选择器里三行词表名称全部白字浅底不可见（词数和蓝色对号仍可见），且未选中行被渲染成工具栏蓝色按钮而非菜单行。功能（点击、多选、持久化、对号状态）本身正确，但用户无法正常读到“四级高频/六级高频/考研高频”的名称，属于新功能的必修视觉缺陷。
- 建议：让菜单项脱离工具栏动作按钮规则，或提高菜单规则特异性并同时声明 `background/color/border/padding/border-radius`（例如给菜单项增加专用 class，或在全局规则中加入 `:not([role="menuitemcheckbox"])`），并补一条渲染样式回归断言。

### 3e 其他观察

- GitHub URL 在线导入仍是占位按钮（`SettingsPage.tsx:173-175`，交付说明 `CHANGES-R5.md:27` 已声明网络/认证受限）。本地 TXT/CSV 导入完整；若按 R5 原文“GitHub 找高频词源扩充”要求在线导入，这项尚未实现，需要负责人确认是否接受占位。
- 三张内置表各 1600 条，但三表并集为 1833 词（重叠较高）；这是阶段 3 已接受的 ECDICT 筛选口径，不是 R5 新增回归，仅作为数据口径备忘。

## 4. 作文批改 —— 通过（有 1 项测试缺口）

- **通道复用正确。** `service.ts:9-27` 用 `resolveModelConfig` + `createDefaultTransport`，桌面端仍走既有 `model_chat`，没有新增第二套模型通道；`prompts.ts:3-24` 覆盖语法、单词、拼写、时态、搭配，要求只返回受限 JSON，并按严重程度组织；`parse.ts:31-67` 兼容代码围栏、尾逗号、常见字段别名，按严重度与位置排序，空结果会报错。
- **迟到响应隔离存在。** `EssayPage.tsx:39-64` 为每次请求设置会话内 `pendingId`，成功回调同时检查 `current.pendingId === requestId` 与 `current.text.trim() === text`，只有当前请求且正文未变才替换结果；`finally` 也只清除自己的 pendingId。导航离开再返回时 App 保持会话状态（`App.tsx:150-153, 784-789`），迟到结果不会覆盖新请求。
- **不落库。** 作文正文与结果只在 App 的 React state 中；全库检索无 `yuejian.essay` 或作文持久化路径，`EssayPage.test.tsx:66` 也断言不写 localStorage。
- 测试覆盖服务调用、提示词关键项、解析排序/容错、粘贴、TXT 导入、分节展示、会话跨页保留与重新批改（`service.test.ts`、`parse.test.ts`、`EssayPage.test.tsx`）。
- 测试缺口：`EssayPage.test.tsx` 没有像阅读侧栏那样用可控 deferred Promise 构造“旧请求晚到/新请求先完成”的组件测试；序号隔离目前由代码审阅确认。另 `catch` 分支没有检查序号，只是显示错误、不覆盖结果，正常 UI 的 `busy` 会阻止并发请求，故列为非阻断建议：补一条乱序测试，并给 catch 加同样的序号判断。

## 5. 跨模块回归与命令注册 —— 通过

- **新增命令无遗漏。** `lib.rs:337-367` 的 `generate_handler!` 包含 `export_word_favorites`、`backup_database`、`delete_all_data`、`list_wordlists`、`list_words`、`import_wordlist`、`delete_wordlist`；`tauriApi.ts:65-73`、`types.ts:227-233` 均暴露同名方法，mock `mock.ts:904-972` 全部实现。用脚本比对 `tauriApi` 的 `invoke` 名与 handler 列表，缺失项为 0。
- **App 接线成立。** 新增 `essay`/`settings` 视图与导航按钮（`App.tsx:634-653`），分支渲染正确（`App.tsx:774-806`）；设置页清空数据后清理当前文章、分区、资料库、编辑器和 `yuejian.last`（`App.tsx:794-804`）；作文会话由 App 持有，跨页不丢。
- **阶段 3 划词未被破坏。** ReaderView 的段落仍保留 `onMouseUp`/`onKeyUp`/`onClick` 和选区偏移逻辑，标色只改变字节点而不改变文本；无选择时回退为纯文本渲染。`ReadingAssistant.test.tsx` 的取词、短语翻译、解析、迟到响应、文章切换等用例全部通过；`VocabularySelector.test.tsx` 的标色用例也通过。
- 非阻断观察：删除全部数据后 localStorage 的 `yuejian.vocabulary.selected` 未清除；下次进入阅读页会按现存启用表过滤并覆盖为空，若之后导入新表不会默认勾选。属于偏好残留，不影响数据一致性，可在清空时顺手移除该键。
- 非阻断观察：mock 的默认分区重载补回与桌面不一致，见第 2 节观察 2。

## 实际验证

- `npm test`：26 个测试文件通过、2 个跳过；128 个测试通过、3 个跳过（与交付说明一致）。
- `cargo test`：35 通过、1 忽略（真实 Magpie 联调用例）。
- `npm run build`：`tsc --noEmit` 与 Vite 生产构建通过。
- `cargo check`：通过。
- 词表一致性：Node 逐项比较三库，均为 1600/1600 且顺序完全一致。
- WAL 备份：另用 SQLite 3.50 验证 WAL 模式下、连接保持打开且有 WAL 文件时，`VACUUM INTO` 副本包含全部已提交数据。
- 选择器样式：用完整 `src/styles.css` 与生产构建 CSS 在 headless Chrome 中实际计算选中/未选中菜单项的颜色、背景和内边距，确认 3d 的白字浅底问题。
- 未执行：真实桌面窗口的保存/打开对话框、真实备份按钮、真实在线模型与 GitHub 在线导入、实机视觉验收。上述边界不改变本次代码级结论，但建议负责人实机验收时重点看桌面保存一次、备份后重开以及选择器默认全选的可读性。
## R5.1 修复记录

- **ISSUE-07 词表选择器 CSS 级联缺陷已修复。** 菜单项增加 `vocabMenuItem` 专用类，完整声明背景、文字颜色、边框、内边距和圆角；全局工具栏按钮规则同时排除 `[role="menuitemcheckbox"]`。选中项为浅蓝底深字并保留可见对号，未选中项为白底深字。`VocabularySelector.test.tsx` 引入完整样式表，使用 headless computed style 断言选中项文字非白色，并核对选中/未选中背景色及对号节点。
- **作文迟到响应隔离测试已补齐。** `EssayPage.test.tsx` 使用两个可控 deferred Promise，让第二次批改先完成、第一次批改后返回，直接断言旧响应不会覆盖新结果。
- **验证通过。** `npm test`：26 个测试文件通过、2 个跳过，130 个测试通过、3 个跳过；`npm run build`：TypeScript 检查与 Vite 生产构建均通过。
