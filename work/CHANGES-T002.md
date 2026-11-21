# T-002 改动清单 · 阶段 2 真题导入

| 项 | 内容 |
|---|---|
| 任务 | T-002：PDF.js 文字/坐标提取 → Section A/B/C 拆篇 → 跨页拼接 → 空位/题号恢复 → 预览校对 → 一套卷一次事务入库 |
| 基线 | `6e3402e`（`feat: 完成阶段1本机阅读骨架`） |
| 分支 | `master` |
| 完成日期 | 2026-11-21 |
| 当前状态 | 代码完成，工作区改动尚未提交；真实样卷已提取并逐卡对照，前端/Rust 测试与构建均通过 |
| 样卷 | `D:\豆包\2026年6月大学英语四级真题（第1套）.pdf`（只读，未复制进仓库，未修改原文件） |

## 1. 改动范围

### 1.1 新增文件

| 路径 | 内容 |
|---|---|
| `src/import/types.ts` | 提取、拆篇与导入的中间类型：`RawTextItem`、`TextLine`、`ExtractedDocument`、`WordBankEntry`、`ImportedQuestion`、`ImportedStatement`、`QuestionArea`、`CandidateArticle` |
| `src/import/layout.ts` | PDF 用户空间坐标按基线聚合成行；页眉页脚/纯页码剔除；行内 run 排序与空格保留；行尾连字符还原；跨行/跨页段落重建；页码与题号范围格式化 |
| `src/import/split.ts` | Part III 定位、Directions 跳过、Section A/B/C 与 Passage One/Two 切分；选词填空空位与 A–O 词库恢复；长篇匹配段落字母与 36–45 陈述句解析；仔细阅读题干与 A–D 选项解析；无文字层/无法识别结构时的提示与兜底 |
| `src/import/pdf.ts` | `pdfjs-dist` 4.10.38 legacy 构建的 PDF 文字层提取，逐页进度、取消、加密/损坏/无文字层错误、60 页上限；worker 通过 Vite `?url` 打包 |
| `src/import/fingerprint.ts` | Web Crypto SHA-256 文件指纹，用于同卷重复导入识别 |
| `src/import/PdfImportDialog.tsx` | 导入预览：套卷名、页数、四张卡的类型/标题/页码/题号/段数/题目区摘要；标题与正文可编辑；整体与单卡校对提示；导入按钮与取消；提取失败重新选文件 |
| `src/import/pdfjs.d.ts` | PDF.js legacy 模块与 `?url` worker 的 TypeScript 声明 |
| `src/import/layout.test.ts` | 4 个用例：坐标聚类、行内空格/连字符、页眉页脚剔除、跨页段落 |
| `src/import/split.test.ts` | 7 个用例：Section 拆分、空位恢复、词库、陈述句、选择题、跨页拼接、无文字层与兜底 |
| `src/import/PdfImportDialog.test.tsx` | 4 个用例：预览与四卡导入、无文字层重选、导入失败保留预览并可重试、取消不提交 |
| `src/import/sample.test.ts` | 真实样卷回归（仅在 `T002_SAMPLE_PDF` 指向样卷时执行；仓库不保存真题文件） |
| `src-tauri/migrations/0003_suite_import.sql` | `suites.fingerprint`；指纹唯一部分索引；`(suite_id, sequence_no)` 唯一部分索引 |
| `work/CHANGES-T002.md` | 本改动清单 |

### 1.2 修改的已有文件

| 路径 | 改动 |
|---|---|
| `src/data/types.ts` | `ArticleSummary` 增加 `pageRange`、`questionRange`；`ArticleDetail` 增加 `questionArea`；新增 `ImportArticleInput`、`ImportSuiteInput`、`ImportSuiteResult`；`ReaderApi` 增加 `importSuite` |
| `src/data/tauriApi.ts` | 接入 `import_suite` 命令 |
| `src/data/mock.ts` | 浏览器 localStorage 实现加入套卷、指纹去重、页码/题号/题目区元数据、资料库按套卷分组；导入前整体校验，持久化失败回滚；兼容旧状态 |
| `src/data/mock.test.ts` | 增加套卷导入、分组与元数据、非法输入不落库、存储失败回滚等用例 |
| `src/library/LibraryPage.tsx` | 工具栏与空态增加“导入 PDF”入口；隐藏文件输入；挂载导入预览；导入成功/重复导入通知；列表显示页码与题号 |
| `src/library/LibraryPicker.tsx` | 选择器元信息显示题号范围 |
| `src/styles.css` | 导入预览卡片、题目区、词库、陈述句、选项与提示样式 |
| `package.json`、`package-lock.json` | 新增 `pdfjs-dist@4.10.38`，开发依赖 `@types/node` |
| `tsconfig.json` | TypeScript 类型包含 `vite/client`、`node` |
| `src-tauri/src/db.rs` | 摘要/详情字段扩展；`import_suite` 命令实现：输入校验、指纹去重、`Immediate` 事务、四卡与默认分区成员一次写入、重复题号回滚；新增 4 个数据库用例 |
| `src-tauri/src/lib.rs` | 注册 `import_suite` 命令 |

### 1.3 未改动（回归基线）

`backend/`、`reader-preview/`、`项目方案.md` 未改动。`work/TASKS.md` 的修改是本次任务开始前工作区已有的改动，未由本任务编辑；`work/EXPECTED-T002.md` 为负责人预置的人工基准，保持原样。真实样卷只读，仓库内没有新增 PDF。

## 2. 实现要点

**提取与排版还原。** 用 PDF.js 读取每页文字项的文字、坐标、宽高和字体，以基线容差聚合成行（同页从上到下，行内从左到右），保留显式空格；剔除页眉页脚与纯页码；行尾 `-` 加小写字母时保留连字符并拼接。段落重建以句末标点 + 下一行首大写/数字/引号/括号为边界，跨页时若上一行句未结束则继续拼接。

**拆篇与恢复。** 只在 Part III“Reading Comprehension”之后取阅读材料；跳过 Directions 至正文标题；按 Section A/B/C、Passage One/Two 切分。Section A 从 `[26]`…`[35]` 文本标记恢复空位并输出可见的 `[26] ________`，从 A)–O) 恢复 15 个候选词；Section B 从 A)–L) 段落标记与“Statements:”后的 36–45 编号恢复陈述句；Section C 恢复题干与 A)–D) 选项，题目只进 `questionArea`，不混入正文。识别失败时给出可校对提示并按原文兜底，不静默丢内容。

**预览与入库。** 导入前显示四张卡及题目区，标题和正文可编辑；套卷名默认取文件名。点击导入后先做标题/正文非空校验，再计算文件 SHA-256，调用 `import_suite`。Rust 侧在 `TransactionBehavior::Immediate` 事务中校验全部文章、插入套卷/文章/默认分区成员；任一失败回滚，不留下半套。同一指纹再次导入返回已有卡片并标记 `created=false`，不重复建卡。

## 3. 真实样卷逐卡对照

样卷共 14 页；Part III 阅读部分识别为 p6–p13，答案页 p14 不建卡。实际共 **4 张阅读卡**，整体校对提示为空。正文词数按空白切分统计。

| 卡 | 实际题型 | 实际页码 | 预期页码 | 实际题号 | 预期题号 | 空位 | 段/词 | 题目区 | 单卡提示 |
|---|---|---|---:|---:|---:|---:|---|---:|---|---|
| A | 选词填空 | 6–7 | 6–7 | 26–35 | 26–35 | 10（26–35） | 4 / 254 | 候选词 15 个（A–O） | 无 |
| B | 长篇匹配 | 7–9 | 7–9 | 36–45 | 36–45 | 0 | 12（A–L）/ 1018 | 陈述句 10 条（36–45）；段落字母 A–L | 无 |
| C1 | 仔细阅读 | 9–11 | 9–11 | 46–50 | 46–50 | 0 | 14 / 349 | 5 题 × 4 选项 | 无 |
| C2 | 仔细阅读 | 11–13 | 11–13 | 51–55 | 51–55 | 0 | 7 / 350 | 5 题 × 4 选项 | 无 |

合计正文 1971 词。四张卡的题型、页码范围、题号范围与 `EXPECTED-T002.md` 一致。

### 3.1 逐卡说明

**Section A（选词填空，p6–7，26–35）。** 空位 26–35 共 10 个，词库 A–O 共 15 个，与预期一致；`O) typically` 位于 p7 顶部，跨页词表尾部被正确并入同一卡。PDF 文字层用方括号题号标记空位（如 `[26]`），不是下划线或绘图线；导入后正文显示 `[26] ________`，供阅读时辨认。该卡正文 4 段、254 词，无校对提示。

**Section B（长篇匹配，p7–9，36–45）。** 实际段落字母为 **A–L 共 12 段**，陈述句 36–45 共 10 条，与预期题号一致；预期文件中的“A–J（待确认段落数）”在代码输出后确认为 A–L，属于预期待确认项的正常收敛，不是缺失。跨页验收点通过：E) 从 p7 末尾接到 p8，L) 从 p9 顶部开始且内容完整，`whale-watching trips` 等 p9 顶部内容保留。该卡正文 1018 词，无校对提示。

**Section C Passage One（仔细阅读，p9–11，46–50）。** 5 题，每题 A–D 四个选项，共 20 个选项；第 47 题选项跨 p10→p11，已拼接。正文 349 词，标题“Passage One”不进入正文；无校对提示。正文被分为 14 段，是下面第 4.1 节说明的启发式分段结果，预期文件未规定该篇段数。

**Section C Passage Two（仔细阅读，p11–13，51–55）。** 5 题，每题四个选项；正文跨 p11→p12，验收短语 `split a sum of money with a peer` 存在；标题“Passage Two”不进入正文。正文 350 词、7 段，无校对提示。

### 3.2 与预期文件的差异

1. **Section B 段落字母范围。** 预期为“A–J（待确认段落数）”；实际为 A–L 共 12 段。以 PDF 原卷为准，12 段完整，陈述句仍为 36–45，无内容缺失。对应预期文件“待确认项 1”已确认。
2. **Section A 空位的 PDF 呈现方式。** 预期待确认“文本下划线还是绘图线条”；实际文字层使用 `[26]` 方括号题号，不需要坐标猜下划线。代码据此恢复题号，并在正文中渲染 `[26] ________`。对应“待确认项 2”已确认。
3. **精确页界。** 预期粗判为 A p6 下半–p7 上、B p7 中–p9 上、C1 p9 中–p11 上、C2 p11 下–p13；实际卡片页码范围 6–7、7–9、9–11、11–13，和粗判一致。相邻卡共用边界页是原卷排版所致。对应“待确认项 3”已确认。
4. **Section C 分段粒度。** 样卷 PDF 的正文没有首行缩进、空行或可区分段距，文字层只提供等距行。实现按句末标点 + 行首大写推断段落，因此 Passage One 被切成 14 段，可能比人工阅读时的段落更碎；Passage Two 为 7 段。该差异不影响文字完整性、顺序或题目区，导入预览与资料库编辑均可再合并段落。预期文件未给出 Section C 段数，故不构成预期项不一致，但作为已知限制记录。

## 4. 验证结果

### 4.1 前端测试

```powershell
# 带真实样卷
$env:T002_SAMPLE_PDF = "D:\豆包\2026年6月大学英语四级真题（第1套）.pdf"
npm test
```

结果：6 个测试文件、**30/30 通过**（约 6.3 s）。不带 `T002_SAMPLE_PDF` 时，样卷用例按设计跳过，结果为 29 通过、1 跳过。

| 文件 | 用例数 | 覆盖内容 |
|---|---:|---|
| `src/App.test.tsx` | 6 | 阶段 1 界面回归：粘贴、编辑、分区、选择器、焦点恢复 |
| `src/data/mock.test.ts` | 8 | 数据层回归 + 套卷导入、分组/元数据、非法输入不落库、存储失败回滚 |
| `src/import/layout.test.ts` | 4 | 坐标成行、空格与连字符、页眉页脚剔除、跨页段落 |
| `src/import/split.test.ts` | 7 | Section 拆分、空位/词库、陈述句、选择题、跨页、无文字层、兜底 |
| `src/import/PdfImportDialog.test.tsx` | 4 | 预览与导入、无文字层重选、导入失败重试、取消不提交 |
| `src/import/sample.test.ts` | 1 | 真实样卷：4 卡、页码/题号、空位 26–35、词库 A–O、B 的 A–L 与跨页、C 的 5×4 选项与跨页文本 |

### 4.2 Rust 测试

```powershell
cd src-tauri
cargo test
```

结果：**15 passed（3 suites）**，含新增 4 个用例：导入生成 4 卡与元数据/分区成员；同指纹重复导入不重复建卡；重复题号触发唯一约束并整体回滚；非法输入在任何写入前被拒绝。

### 4.3 构建

```powershell
npm run build
```

结果：`tsc --noEmit` 与 Vite 构建通过。产物含 `dist/assets/pdf.worker.min-rsCePomN.mjs`（1,417.58 kB），PDF 提取 chunk 373.24 kB，主 chunk 322.08 kB。

### 4.4 浏览器内真实样卷走查

在 Chrome 中通过 Vite 页面使用真实样卷完成：

- 选择 PDF 后显示“已提取 14 页文字”，预览为 4 张卡，页码与题号与上表一致。
- 导入后资料库出现 4 篇文章、1 个套卷分组；打开 Section A 卡可见 `[26] ________`。
- 再次导入同一文件提示“此前已导入，本次未重复建卡”，文章数与套卷数不变。
- 取消预览不改变资料库文章数/套卷数。
- 提取失败（无文字层）显示错误并可“重新选择文件”；导入失败保留预览，可原卡重试。

Tauri 桌面窗口内的手工点击导入未单独执行；`import_suite` 的事务、重复建卡与回滚由 Rust 数据库测试覆盖，前端命令绑定由类型检查与构建覆盖。

## 5. 已知限制

- PDF 必须带文字层；扫描件会提示“这个 PDF 没有可提取的文字层”，不做 OCR。单次最多读取 60 页。
- 拆篇依赖四级卷面结构（Part III / Reading Comprehension / Section A/B/C / Passage One/Two）。其他版式会退回单张原文卡并提示校对，不保证自动分篇。
- 无首行缩进/空行的正文只能按句界推断段落，段数可能比人工分段更碎；文字内容与顺序不受影响。
- 空位依赖文字层中的 `[题号]` 标记；若原卷只画下划线而无题号文本，会通过提示要求人工校对。
- 一次导入按套卷整体成功或整体回滚；暂不支持只替换其中一张卡、合并到已有套卷或删除套卷。重复导入只识别完全相同文件指纹，文件被重新导出后指纹会变化。
- 预览与资料库编辑仍沿用阶段 1 的段落文本约定（空行分段），不保存 PDF 原始排版。
- 导入后题目区暂以 JSON 字符串随文章保存，阶段 2 只在预览和详情数据中展示，尚未接入答题/解析界面（属于后续阶段）。

## 6. 提交与工作区状态

改动尚未提交。本任务产生的文件为 `src/import/`、`src-tauri/migrations/0003_suite_import.sql`、`work/CHANGES-T002.md`，以及对数据层、资料库页面、Rust 命令与依赖配置的修改。`backend/`、`reader-preview/`、`项目方案.md`、样卷 PDF 均未修改；`work/TASKS.md` 与 `work/EXPECTED-T002.md` 保持任务开始前的状态。