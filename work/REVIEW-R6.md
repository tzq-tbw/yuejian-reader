# R6 反审报告

日期：2026-11-22
范围：`work/CHANGES-R6.md` 四项；只读核验，未改动交付代码。
复验命令：`npm test`、`npm run build`、`cargo test`（`src-tauri`）。临时验证用例与 `.vitest/` 缓存已在核验后删除。

复验结果：

- `npm test`：29 个测试文件通过，2 个按原条件跳过；141 项通过，3 项跳过。跳过项为真实样卷 `src/import/sample.test.ts` 和真实 Magpie 联调 `src/language/realModel.test.ts`，与 R6 无关。
- `cargo test`：37 pass，1 ignored（3 个测试套件）。
- `npm run build`：`tsc --noEmit` + Vite 生产构建通过。

## 1. 阅读页三词表分色 — 通过

核验点与证据：

- 命中项按 `list_id` 输出类：`src/reader/ReaderView.tsx:295-303` 把 `token.matches` 的 id 直接拼成 `vocabMark cet4/cet6/ky ...`，重叠词保留全部命中类，`title` 汇总全部类别（`:300-302`）。
- 三色与重叠样式：`src/styles.css:762-786`。四级蓝 `#dcecff/#2472d0`、六级紫 `#efe1ff/#8250c7`、考研橙 `#ffead2/#d66a16`；单表规则带 `:not(...)` 避免与重叠规则打架；双色用分色渐变 + 两层 inset 下划线，三色用三段渐变 + 三层下划线。
- 图例：`src/reader/ReaderView.tsx:65-69` 定义三表图例，`:263-270` 按当前加载的词表渲染，包含“重叠命中以多色下划线区分”；色块样式在 `src/styles.css:789-794`。
- 直接测试：`src/reader/ReaderView.test.tsx:83-103` 断言单表类、重叠类、`title`、三色 computed background、三色 boxShadow 和图例文本。该用例在完整 `npm test` 中通过；我另用样式计算确认重叠规则确实生效（boxShadow 同时含三色）。
- 跨模块回归：`src/reader/VocabularySelector.test.tsx`（三表默认全选、多选、跨页面恢复、可读前景/背景色）与 `src/reader/ReadingAssistant.test.tsx`、`src/collection/CollectFlow.test.tsx` 的选区/划词用例全部通过。`ReaderView.tsx` 的 R6 改动仅新增图例，未改 `captureSelection`/`wordSelectionFromMark`/`tokenizeWithVocabulary`，选区按文本偏移计算（`src/reader/selection.ts:99-107,164-173`），不受标色 DOM 影响。

结论：通过。

## 2. 作文批改历史 — 通过

核验点与证据：

- 迁移两表：`src-tauri/migrations/0006_essay_history.sql:1-21`。
  - `essay_documents`：自增主键、`sequence_no UNIQUE`、名称、当前正文、时间戳。
  - `essay_revisions`：`document_id` 外键 + `ON DELETE CASCADE`、`revision_no`、正文快照、`result_json`、时间戳；`UNIQUE(document_id, revision_no)` 与索引。
  - 迁移已登记为版本 6：`src-tauri/src/db.rs:272-276`；连接层启用 `PRAGMA foreign_keys = ON`（`src-tauri/src/db.rs:327-334`），级联删除真实生效。
- Rust CRUD：`src-tauri/src/essay_history.rs:128-266` 覆盖列表、新建、重命名、正文更新、删除、批改记录新增/删除；`add_essay_revision` 在同一事务中插入批改并更新当前正文（`:211-259`），失败整体回滚；返回字段使用 camelCase（`:4-25`）。Rust 测试 `:288-343` 覆盖序号生成、同篇两次批改、重命名、删除批改、删除作文级联和空正文拒绝，`cargo test` 通过。
- 前后端契约与 mock 一致：`src/essay/types.ts:28-60`、`src/data/types.ts:241-247`、`src/data/tauriApi.ts:75-81`、`src/data/mock.ts:1024-1106`。mock 的序号、名称默认值、正文 trim、30k 字符/60 字符校验、批改追加逻辑与 Rust 相同；mock 历史写入 `yuejian.browser.db` 并跨实例恢复。清空数据：Rust `src-tauri/src/settings.rs` 删除 `essay_revisions`/`essay_documents`，mock `deleteAllData` 重置为空。
- 侧边栏交互：默认收起（`src/essay/EssayPage.tsx:65,259-334`）；序号按钮只显示数字，展开后才出现“第 N 次批改”；支持收起、重命名修改区、删除修改区和删除单条批改。`src/essay/EssayPage.test.tsx:127-162` 覆盖收起/展开/两次批改归同一序号/重命名/重新挂载恢复，测试通过。
- 当前作文关联选中序号：批改开始时固定 `selectedDocumentId`，响应通过首次迟到校验后追加到该序号（`src/essay/EssayPage.tsx:138-154`）；选中序号持久化在 `yuejian.essay.selectedDocumentId`（`:95-102`），重新挂载按该 id 恢复（`:104-123`）。
- R5 迟到隔离未破坏：旧用例 `src/essay/EssayPage.test.tsx:65-111` 仍保留并通过；新代码在模型响应后、写历史前增加双重待办/正文校验（`src/essay/EssayPage.tsx:145,148`），过期响应不会写入 history。

备注（不阻塞通过）：

- 序号使用 `MAX(sequence_no)+1`（Rust `:152-158`，mock 同）；删除最大序号后再新建会复用该数字。若“稳定序号”要求永不复用，可改为持久计数器。
- 点击历史版本会把该版本正文装入编辑区；失焦时 `saveText` 会将旧版本正文写回当前正文（`src/essay/EssayPage.tsx:193-201`）。这可视作“选择即恢复”，但如产品语义只是查看历史，需要加只读/确认保护。

结论：通过。

## 3. GitHub 词源导入 — 通过

核验点与证据：

- 三种格式解析：`src/language/onlineWordlist.ts:84-127`。
  - 四级词频 CSV：解析 `rank,word`，只接收整数 rank 1–1200，剔除功能词并去重。
  - 六级 Markdown：只处理表格行，序号列必须是数字，清洗 `**`、`__`、反引号后收集单词。
  - 考研逗号行：按中英文逗号/换行切分，去重并过滤短语、数字和非单词字符。
- 真实源实测（我直接下载三个 Raw 文件并用新解析函数跑结果）：
  - `yiyisheh/CET4-vocabulary` → 1087 词；`the/to/of/and/is/are` 均未进入结果。
  - `wangjiuyi543-ui/cet6-vocabulary` → 500 词。
  - `wyyxdgm/dc` → 2303 词。
  - 与 `work/CHANGES-R6.md` 的 1087/500/2303 一致。
- 与 R5 导入链路整合：设置页下载并解析后调用现有 `api.importWordlist({ name, source: rawUrl, content: words.join("\n") })`（`src/settings/SettingsPage.tsx:154-167`），复用 Rust/mock 的本地导入通道；Rust 导入在事务内完成（`src-tauri/src/wordlists.rs`），mock 在解析成功后一次性 push。在线词表生成新的 custom id，不覆盖内置表；列表来源以 `https://raw.githubusercontent.com/` 前缀显示为 GitHub（`src/settings/SettingsPage.tsx:299-303`）。
- URL 与错误处理：`src/language/onlineWordlist.ts:129-158` 仅接受 https + `raw.githubusercontent.com`，先检查 `response.ok` 再解析，文件 >2MB 或零词直接抛错；抛错发生在 `importWordlist` 之前，因此 404/格式错误不会留下半张表。我用临时组件用例复验：404 时 notify 收到 `HTTP 404` 且词表数量不变；200 但内容格式错时 notify 收到“没有可导入”且词表数量不变，用例通过后已删除。
- 测试：`src/language/onlineWordlist.test.ts` 覆盖三格式、下载链路、URL 限制；`src/settings/SettingsPage.test.tsx:111-134` 覆盖预设 URL → 下载 → mock 入库 → GitHub 来源/词数。均通过。

备注（不阻塞通过）：

- 四级功能词表未包含部分情态动词；真实源中 `may`（rank 47）、`would`（74）、`might`（206）、`must`（248）仍会导入。若目标是严格排除功能词，可补充该集合；当前结果 1087 仍在 600–1500 目标区间内。

结论：通过。

## 4. 自定义模型服务 / API Key — 通过

核验点与证据：

- 覆盖链：`src/language/config.ts:82-96` 顺序为显式参数 > localStorage（`yuejian.modelService`）> `VITE_LANGUAGE_*` 环境覆盖 > 默认 Magpie。`config.test.ts:27-40` 通过：保存千问后不带参数解析得到千问地址/模型/Key，显式参数仍最高。
- 预填：`src/language/config.ts:19-39` 定义 Magpie/DeepSeek/千问预设；DeepSeek 为 `https://api.deepseek.com/v1` + `deepseek-chat`，千问为 `https://dashscope.aliyuncs.com/compatible-mode/v1` + `qwen-plus`。`src/settings/SettingsPage.test.tsx:136-155` 验证切换供应商后的预填和保存。
- 动态生效：`src/language/transport.ts:15-20,69-87` 每次请求调用配置源；`src/language/service.ts` 与 `src/essay/service.ts` 改为传入函数，精读/作文共用动态配置。`config.test.ts:42-56` 验证连续两次请求切换供应商时 URL、model、Bearer Key 全部更新。
- 密码输入与保存：`src/settings/SettingsPage.tsx:225` 使用 `type="password"` + `autoComplete="new-password"`；保存前校验 URL 协议和“直连供应商必须有 Key”（`:90-109`）；界面注明 localStorage 暂存、阶段 5 迁移系统凭据。
- Key 不进日志/不进 git：
  - `src/` 与 `src-tauri/src/` 内无 `console.log`/`println!`/`log::`/`dbg!` 输出 Key；`src-tauri/src/lib.rs:61-113` 仅把 `apiKey` 放进本次 `bearer_auth` 请求头，错误信息只含 baseUrl/status/响应片段。
  - 工作区源码无可疑 Key 字面量；`git status` 无 `.env`/凭据文件，只有测试夹具字符串（如 `deepseek-test-key`、`qwen-secret`）。真实 Key 只进入运行时 localStorage。
- 桌面端链路：`src/language/transport.ts:74-87` 继续调用 Rust `model_chat`；`src-tauri/src/lib.rs` 命令签名接收本次 Key，不持久化。未发起真实付费供应商请求，与交付说明一致。

结论：通过。

## 跨模块回归 — 通过

- 完整 `npm test`：29 文件/141 用例通过，覆盖阅读页三色、R5 词表选择器、阶段 3 划词/选区、收藏流程、作文页、设置页。
- `npm run build` 通过，说明新增类型/导入无 TS 错误。
- `cargo test` 37 通过，迁移 6、故事历史 CRUD、级联删除、清空所有数据均覆盖。
- `ReaderView.tsx` 的 R6 diff 只有图例；标色类名、点词逻辑、选区捕获函数均未变。新 CSS 只影响 `mark.vocabMark` 与图例，不触碰 `VocabularySelector` 菜单样式。
- 未在真实桌面窗口和真实供应商账号下操作；这部分仍是交付说明中列明的实机验收残留项，不影响本次只读代码核验结论。

## 总评

四项全部通过，未发现阻断问题。三项备注均为边界/产品语义优化项：序号复用、历史版本失焦回写、四级功能词集不含部分情态动词。