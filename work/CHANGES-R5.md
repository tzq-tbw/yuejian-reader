# R5 交付说明

日期：2026-11-22

## 1. 导出修复与设置页

- 安装并注册 Tauri 官方 `@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs` 及对应 Rust 插件；主窗口 capabilities 已加入 `open`、`save`、`readTextFile`、`writeTextFile` 权限。
- 桌面导出走 `save` 选择目标路径，再由 `writeTextFile` 写入 UTF-8 BOM CSV，不再经过 WebView2 会阻止的 `<a download> + Blob`。浏览器预览保留原下载方式作为降级。
- CSV 仍只含「单词 / 词性 / 基本意思」三列，不含语境义、原句、解析或长难句。Rust 负责从数据库生成 CSV，前端 mock 使用同规则生成。
- 收藏页导出按钮已移除，新入口位于「设置 → 数据与备份」。
- 新设置页包含：
  - 生词本导出；
  - SQLite 备份：使用 `VACUUM INTO` 在数据库打开期间生成一致性副本，目标文件已存在时拒绝覆盖；
  - 删除数据：两个连续确认弹窗，事务清空文章、分区、收藏、排程、复习事件、套卷和全部词表，保留迁移记录；
  - 更新占位：显示 0.1.0，说明阶段 5 接入 Tauri updater；
  - 词表管理与本地文件导入。

关键文件：`src/settings/SettingsPage.tsx`、`src/data/files.ts`、`src-tauri/src/settings.rs`、`src-tauri/capabilities/default.json`。

## 2. 词表迁移、管理与高亮选择器

- 新增连续迁移 `0005_wordlists.sql`：`wordlists` 保存名称、来源、启用和内置标记；`wordlist_words` 以 `list_id + word` 为主键并级联删除。
- Rust 在迁移 0005 的同一事务中填充四级、六级、考研三库。三份数据由现有 `src/language/wordlists/*.ts` 原样转换为 Rust `include_str!` 文本，每库 1600 词；脚本交叉比对三库 4800 词逐项一致。
- 已删除的内置词表不会因重启或重复迁移而重新出现。所有内置表默认启用，阅读页无本地选择记录时默认全选，兼容 R3/R4 三表同时开启的行为。
- 设置页展示词数、来源、启用状态、内置/导入来源，可删除单表。
- 本地导入支持一行一词的 TXT，以及首列为单词的 CSV（含引号与 BOM）；统一小写、去重，空名称或无有效单词时拒绝且不留下半张表。
- GitHub URL 导入为明确的占位按钮。WebSearch、WebFetch、GitHub CLI 和直接访问本次均受网络/认证限制，未添加未经核实的第三方词源；继续使用项目已有固定提交、许可和筛选口径明确的 ECDICT 数据。可下载 ECDICT CSV 后通过本地文件入口导入。
- 正文顶部改为词表多选弹出面板，每行以带对号的 `menuitemcheckbox` 表示选中状态，可单选、多选或全部取消。选择写入 `localStorage` 的 `yuejian.vocabulary.selected`。
- 阅读页先读取数据库启用词表，再用 Rust `list_words` / mock `listWords` 获取所选词表单词；已删除或禁用的词表不会参与匹配。自定义导入表也会进入选择器。

关键文件：`src-tauri/src/wordlists.rs`、`src-tauri/migrations/0005_wordlists.sql`、`src/reader/VocabularySelector.tsx`、`src/reader/wordlistSelection.ts`、`src/language/wordlistImport.ts`。

## 3. 作文批改

- 新增「作文批改」导航及 `src/essay/` 模块。
- 支持粘贴作文和导入 TXT；正文与结果只保存在 App 会话状态，切换页面不丢失，不写 SQLite 或 localStorage。
- 通过现有默认 transport 调用桌面 Rust `model_chat`，新提示词覆盖语法、单词、拼写、时态、搭配，要求返回受限 JSON。
- 解析兼容代码围栏、尾逗号及常见字段别名；结果按严重程度、原文位置排序，分「严重问题 / 建议修改 / 细节优化 / 润色版」展示，保留原文、修改建议和中文解释。
- 可重新批改。请求带会话内序号，只有仍是当前请求且正文未变的响应才能替换结果，避免导航或新请求后的迟到响应覆盖。

关键文件：`src/essay/service.ts`、`src/essay/prompts.ts`、`src/essay/parse.ts`、`src/essay/EssayPage.tsx`。

## 4. 新增 Tauri 命令与双端契约

已注册并接入 `tauriApi` 与 `ReaderApi`：

- `export_word_favorites`
- `backup_database`
- `delete_all_data`
- `list_wordlists`
- `list_words`
- `import_wordlist`
- `delete_wordlist`

`listWords(undefined)` 返回全部启用词表，`listWords([])` 返回空数组；删除、导入、清空和 CSV 字段规则在 mock 与 Rust 双端保持一致。作文继续使用原 `model_chat`，未新增第二套模型通道。

## 5. 验证结果

- `npm test`：26 个测试文件通过，128 个测试通过；另有 2 个文件 / 3 个真实样卷或真实模型用例按原约定跳过。
- `cargo test`：35 通过，0 失败；1 个需要本机 Magpie 的真实模型用例按原约定忽略。
- `npm run build`：通过。
- `npx tauri build --debug --no-bundle`：通过，生成 `src-tauri/target/debug/yuejian.exe`，同时验证桌面 capabilities 与 Rust 插件链接。
- Rust 文件测试：实际在临时目录写 CSV 并断言 BOM、CRLF、转义及字段范围；实际生成数据库备份后重新打开 SQLite 并读取文章。
- 设置页测试覆盖导出、备份、更新与 GitHub 占位、本地词表导入/删除、双重确认清空。
- 阅读页测试覆盖默认三表全选、自由组合、全部取消、空选择和跨重开持久化。
- 作文测试覆盖 mock transport、提示词、解析排序、粘贴、TXT 导入、分节展示、会话保留和重新批改。
- 命令注册、插件权限、迁移 0001–0005、内置词数据一致性已交叉核对；`src` 与 `src-tauri/src` 无 `console`、`println!` 或 `dbg!` 遗留。

真实在线模型和 GitHub 在线导入未联网验证；后者本轮按需求仅为占位。桌面保存/打开对话框使用官方插件 mock 验证调用参数，Rust 文件落盘与桌面配置构建分别验证。
