# T-002 阶段 2 真题导入独立审查

日期：2026-11-21  
审查范围：`work/TASKS.md`、`work/EXPECTED-T002.md`、`work/CHANGES-T002.md`，以及 `src/import/`、`src/data/` 的套卷导入链路、`src-tauri/src/db.rs`、`src-tauri/migrations/0003_suite_import.sql` 和相关界面/测试。  
审查方式：只读审查与运行验证，未修改实现代码。

## 结论

**暂缓验收。有 3 项严重问题必须修复。**

真实样卷的 4 卡拆分、题号、空位、词库、跨页正文和题目区均与人工基准一致；SQLite 事务、回滚和数据库唯一约束也成立。但正常 worker 提取路径会把文件缓冲区转移走，随后计算出的并非试卷指纹，而是空内容指纹。这会使第二份不同试卷被误判为第一份的重复导入，是当前最直接的验收阻断项。

## 严重问题（必须修）

### 1. 提取后才计算指纹，原 `ArrayBuffer` 已被 PDF.js 转移，不同试卷会得到同一个空内容哈希

**证据：**

- `src/import/pdf.ts:27-29` 直接用原始 `data` 创建 `Uint8Array`，没有保留副本；PDF.js 在 worker 模式下会 transfer 其底层缓冲区。
- `src/import/PdfImportDialog.tsx:216-220` 把同一缓冲区保存到 `bufferRef.current` 并交给 `extractPdf`；`src/import/PdfImportDialog.tsx:281-282` 在提取完成后才对该引用计算 SHA-256。
- 去重直接信任这个值：`src/data/mock.ts:348-359`、`src-tauri/src/db.rs:666-681` 找到同指纹套卷后立即返回已有卡片。
- 现有界面测试同时 mock 了提取和指纹，无法覆盖真实组合：`src/import/PdfImportDialog.test.tsx:82-84`。真实样卷测试只提取和拆篇，没有计算指纹：`src/import/sample.test.ts:15-54`、`src/import/sample.test.ts:57-62`。

**实际复现：** 使用项目真实的 `extractPdf → sha256Hex` 顺序读取样卷，提取前文件哈希为 `2d8d64d3…c1ac8`；提取后 `sampleBuffer.byteLength === 0`，哈希变成空内容 SHA-256：

```text
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

**影响：** 第一份试卷可能正常入库，但之后导入内容完全不同的 PDF，也会命中同一个空内容指纹，界面提示“此前已导入”并返回第一套已有卡片，第二套不会建卡。同文件重复导入测试因此会给出虚假的安全感。

**修复方向：** 在调用 PDF.js 前保留独立副本或先计算真实文件指纹，并增加“连续导入两份内容不同的 PDF，必须生成两套卡”的真实 `extractPdf → fingerprint → importSuite` 集成回归；不能只 mock 其中一段。

### 2. Section C 拆篇失败时，兜底原文卡丢弃已识别的 Section A 和 Section B

**证据：**

- `src/import/split.ts:535-540` 在找不到两个 Passage 时调用 `fallbackArticle(sections.C, ...)`，只传入 C。
- 这与函数注释“任何一部分无法识别时，返回整段原文卡”不符：`src/import/split.ts:500-504`；也不符合交付说明的“不静默丢内容”口径：`work/CHANGES-T002.md:54-58`。

**实际复现：** 构造包含 Part III、Section A/B/C 和 Passage One、但缺少 Passage Two 的文字层，结果为 1 张 raw 卡：

```text
keepsA=false, keepsB=false, keepsC=true
```

**影响：** 用户按提示校对并导入兜底卡时，A、B 内容已经不在预览中，无法通过预览修正，最终只保存 C 的原文。

**修复方向：** 此分支应保留完整 `readingLines`，而不是仅保留 `sections.C`；增加“C 识别失败，A/B/C 文本仍全部存在”的回归用例。

### 3. Section B 的题目区分界会漏掉首条带序号陈述；裸题号变体还可能混入正文

**证据：**

- `src/import/split.ts:351-355` 会把首个 `1. 36. ...` 行识别为陈述区起点。
- `src/import/split.ts:356-357` 随后无条件从 `statementsIndex + 1` 取题目行，导致首条陈述本身被排除。
- `parseStatements` 实际期待接收并解析这一行：`src/import/split.ts:169-179`。
- 对没有 `Statements:` 标题、直接使用 `36. ...` 的形式，起点检测只识别带序号的 `1. 36. ...`，不识别裸 `36.`；这些行会被 `parseLetterParagraphs` 当续行附到最后一个正文段落：`src/import/split.ts:273-279`。

**实际复现：** 无 `Statements:` 行，输入 `1. 36. First statement.` 和 `2. 37. Second statement.`，输出只剩题 37，题 36 丢失。

**影响：** 可识别的合法陈述句变体发生题目缺失；裸题号变体还会破坏“题目不混入正文”。虽然当前样卷带独立 `Statements:` 行而未触发，但解析器已显式声称支持这些形式，应修正而不是依赖单一排版。

**修复方向：** 区分“Statements: 标题行”和“首条陈述行”，后者必须包含在 `statementLines` 中；起点检测与 `parseStatements` 支持的裸 36–45 形式保持一致，并分别补首条陈述、裸题号和跨页续行测试。

## 建议

### 1. 题目区提示“请校对”，但界面只能修改标题和正文，无法修正结构化题目区

- 标题、正文是唯一编辑控件：`src/import/PdfImportDialog.tsx:141-158`。
- 词库、陈述句、题干和选项只读展示：`src/import/PdfImportDialog.tsx:44-97`、`src/import/PdfImportDialog.tsx:159-164`。
- 提交时直接序列化原 `card.questionArea`：`src/import/PdfImportDialog.tsx:290-297`。
- 解析器却要求用户校对空位、词库和题目区，例如 `src/import/split.ts:105-120`、`src/import/split.ts:187-197`。

建议提供结构化题目区编辑能力，或在识别不完整时允许切换为可编辑原文/阻止不完整结构化数据入库；若本期明确只支持正文校对，应收窄提示与交付口径，避免给用户一个无法完成的操作。

### 2. `Directions` 跳过规则依赖固定 30 单位大间距，缺少该间距时会继续吞掉正文

`src/import/split.ts:24-37` 只有遇到 `gap > 30` 才停止跳过；如果 Directions 后正文使用普通行距，循环会把正文也当作说明跳过，跨页时则直接使用无穷大间距。当前样卷未触发，但建议补“Directions 与正文等距”“Directions 跨页”的针对性样本，改用题型、标题、段落标记或题号共同确定正文起点。

### 3. 连字符实现与交付说明不一致：当前保留所有行尾连字符，并未还原本应去连字符的断词

- `src/import/layout.ts:133-143` 在 `-` 后接小写时执行 `out += text`，连字符仍保留。
- 题目区续行同样保留：`src/import/split.ts:71-77`。
- 交付说明写的是“去掉连字符并拼接”：`work/CHANGES-T002.md:54`。

最小探针 `The infor-` + `mation is complete.` 输出 `The infor-mation is complete.`。当前样卷发现的连字符均为 `consumer-friendly`、`whale-watching`、`non-organic` 等合理复合词，未发现样卷正文因此错字，所以列为建议而非样卷阻断项。建议明确“复合词保留”和“断词去横线”的判定策略及测试，或修正交付描述。

### 4. 行内文本仅按 `str` 直接相连，坐标间隙不会补空格

`src/import/layout.ts:56-62` 使用 `.join("")`，虽然保存了 `x` 和 `width`，但未据此判断词间空隙。最小探针中相邻文本块 `Hello`、`world` 输出 `Helloworld`。当前样卷文字层自带必要空格，未触发；建议增加基于相邻 run 右边界与下一 run 左边界的最小用例，避免其他 PDF 出现黏词。

### 5. 浏览器 mock 与 Rust 对“已有指纹 + 重复篇次”的非法请求处理顺序不同

mock 在查询已有指纹前先拒绝重复篇次：`src/data/mock.ts:340-349`；Rust 先按指纹返回已有套卷，只有新套卷写入时才由唯一约束发现重复篇次：`src-tauri/src/db.rs:666-681`、`src-tauri/src/db.rs:719-748`。正常界面生成固定且唯一的 1–4 篇次，不影响当前样卷；建议让两端校验顺序一致，并补同一非法请求的双端契约测试。

## 确认可行

### 1. 真实样卷拆分结果与人工基准一致

实际调用项目 `extractPdf` 和 `analyzeReadingDocument` 读取 14 页样卷，得到 4 卡且无整体或单卡警告：

- Section A：p6–7，题 26–35，10 个空位、A–O 共 15 个候选词；p7 的 `O) typically` 保留。
- Section B：p7–9，题 36–45，A–L 共 12 段、10 条陈述；跨页 E 段和 p9 顶部 L 段完整，`whale-watching trips` 保留。
- Section C Passage One：p9–11，题 46–50，5 题且每题 A–D 四选项。
- Section C Passage Two：p11–13，题 51–55，5 题且每题 A–D 四选项；跨页短语 `split a sum of money with a peer` 保留。

对应自动断言见 `src/import/sample.test.ts:57-130`。正文拆分在首个预期题号前截止，题目行单独进入 `parseQuestions`：`src/import/split.ts:397-405`、`src/import/split.ts:425-433`；本轮输出未发现 Directions、题干或选项混入样卷正文。

### 2. SQLite 一套卷写入事务完整，重复篇次失败会整体回滚

所有输入在写入前校验：`src-tauri/src/db.rs:587-664`。套卷、文章和默认分区成员位于同一个 `Immediate` 事务：`src-tauri/src/db.rs:689-760`，任一步返回错误都会使未提交事务回滚。重复篇次回滚测试见 `src-tauri/src/db.rs:1292-1300`，非法正文无写入测试见 `src-tauri/src/db.rs:1302-1310`。

### 3. 在传入正确指纹的前提下，数据库与 mock 的常规重复导入均不重复建卡

Rust 同指纹返回原套卷和原卡片：`src-tauri/src/db.rs:666-681`，测试核对 suites/articles/section_articles 数量不变：`src-tauri/src/db.rs:1276-1290`。mock 对应逻辑见 `src/data/mock.ts:348-359`，持久化失败恢复快照见 `src/data/mock.ts:362-416`，相关测试见 `src/data/mock.test.ts:118-177`。此确认不消除严重问题 1：当前真实前端算出的指纹本身不可靠。

### 4. 迁移唯一索引方向正确

`src-tauri/migrations/0003_suite_import.sql:4-6` 对非空 fingerprint 建唯一索引，允许多个历史 NULL；`src-tauri/migrations/0003_suite_import.sql:8-10` 对同一套卷内篇次建唯一部分索引，不影响独立粘贴文章。迁移注册与事务执行见 `src-tauri/src/db.rs:130-145`、`src-tauri/src/db.rs:148-185`。

### 5. 损坏 PDF、超过 60 页、无文字层和提取取消均有明确行为

使用临时内存 PDF 和项目真实模块验证：

- 非 PDF 字节：返回“无法读取 PDF，请确认文件完整且未损坏”，对应 `src/import/pdf.ts:75-87`。
- 61 页：返回“PDF 超过 60 页，请先拆成单套试卷”，对应 `src/import/pdf.ts:39-44`。
- 1 页无文字层 PDF：返回明确的首版支持范围提示，对应 `src/import/split.ts:505-512`。
- 60 页提取到第 1 页后触发取消：返回 `AbortError: 已取消导入`，对应 `src/import/pdf.ts:33-40`、`src/import/pdf.ts:47-49`、`src/import/pdf.ts:75-90`。

### 6. 空标题/正文校验、失败重试和预览取消路径完整

界面提交前逐卡校验：`src/import/PdfImportDialog.tsx:256-276`；mock 和 Rust 也在写入前校验：`src/data/mock.ts:300-346`、`src-tauri/src/db.rs:587-664`。导入异常回到 preview 并保留卡片：`src/import/PdfImportDialog.tsx:278-306`；提取阶段取消会 abort：`src/import/PdfImportDialog.tsx:204-249`。失败重试和取消不提交的界面回归见 `src/import/PdfImportDialog.test.tsx:157-212`。

### 7. 前后端命令参数和返回类型一致，命令已注册

前端契约见 `src/data/types.ts:56-80`、`src/data/types.ts:82-95`；Tauri 调用使用 `import_suite` 和 `{ input }`：`src/data/tauriApi.ts:23-25`。Rust 输入/输出均以 camelCase 反序列化/序列化：`src-tauri/src/db.rs:71-103`，命令包装与注册见 `src-tauri/src/lib.rs:75-81`、`src-tauri/src/lib.rs:132-145`。本轮 `npx tsc --noEmit` 通过。

## 本轮验证记录

- `T002_SAMPLE_PDF=... npm test`：6 个文件、30/30 通过，包含真实样卷。
- `cargo test`：15/15 通过。
- `npx tsc --noEmit`：通过。
- 额外只读探针：真实样卷完整提取/指纹、损坏 PDF、61 页、无文字层、60 页中取消、Section B 首条陈述、C 拆篇失败兜底、连字符和行内坐标空隙。
- 未进行真实 Tauri 窗口点击导入；交付说明也明确该项未单独执行：`work/CHANGES-T002.md:128-138`。本轮尝试连接 Chrome CDP 但本机未启用，因此不把浏览器实机交互记为已验证。

## R2 修复记录

### ISSUE-1：PDF 指纹与连续导入

- `src/import/pdf.ts` 在调用 PDF.js 前复制 `ArrayBuffer`，避免 worker 转移调用方持有的缓冲区。
- `src/import/PdfImportDialog.tsx` 为后续指纹计算保留独立副本，不再与提取过程共享同一底层缓冲区。
- `src/import/sample.test.ts` 新增真实 `extractPdf → sha256Hex → importSuite` 集成回归：连续导入两份字节不同的 PDF，断言指纹和套卷 ID 不同、两次均为新建，资料库共有两套卷、8 张卡。测试未 mock 提取、指纹或导入实现。

### ISSUE-2：Section C 失败兜底

- `src/import/split.ts` 在 Passage One/Two 识别失败时改为向 `fallbackArticle` 传入完整 `readingLines`。
- `src/import/split.test.ts` 新增回归，确认兜底 raw 卡同时保留 Section A、B、C 文本。

### ISSUE-3：Statements 起点与首条陈述

- `src/import/split.ts` 区分独立 `Statements:` 标题行与首条陈述行：仅标题行跳过，首条陈述进入 `statementLines`。
- 起点检测现兼容带序号的 `1. 36. ...` 和裸 `36. ...` 至 `45. ...` 形式。
- `src/import/split.test.ts` 分别补充无标题首条陈述、裸题号不混入正文、裸题号跨页续行回归。

### 顺带修正

- `work/CHANGES-T002.md` 仅调整一行连字符描述，与当前“保留连字符并拼接”的实现一致；建议 1–5 未改动。

### 验证结果

- `T002_SAMPLE_PDF=D:\豆包\2026年6月大学英语四级真题（第1套）.pdf npm test`：6 个测试文件、35/35 通过，包含真实样卷与连续两份 PDF 全链路回归。
- `cargo test`：15/15 通过。
- `npm run build`：TypeScript 检查与 Vite 构建通过。

## R2 反审记录

反审日期：2026-11-21  
范围：只读核验 R2 修复记录中的 ISSUE-1/2/3；未修改实现代码。  
复跑：`T002_SAMPLE_PDF=... npm test` 为 6 个文件、35/35 通过，`sample.test.ts` 两项均实际执行、未跳过；`npx tsc --noEmit` 通过。

### ISSUE-1：通过

- 副本时机正确。`src/import/pdf.ts:27-32` 在 `getDocument` 的入参里先执行 `data.slice(0)` 再构造 `Uint8Array`，复制发生在 PDF.js 接触数据之前。独立探针直接向 `getDocument({ data })` 传入原缓冲区，调用返回后 `data.byteLength === 0`，确认本环境同样存在 transfer，复制是必要且有效的。
- 调用路径已覆盖。生产代码中 `extractPdf` 仅由 `src/import/PdfImportDialog.tsx:216-225` 调用，`sha256Hex` 仅由 `PdfImportDialog.tsx:281` 调用；对话框在提取前把 `buffer.slice(0)` 存入 `bufferRef`（`PdfImportDialog.tsx:218`），提交时只对这份从未交给 PDF.js 的副本计算指纹（`PdfImportDialog.tsx:281`）。`sample.test.ts:39-40` 则依赖 `pdf.ts` 内部复制保护原缓冲区。
- 集成回归真实。`src/import/sample.test.ts:136-156` 未使用 `vi.mock`，走真实 `extractPdf → sha256Hex → importSuite`；两份字节不同的 PDF 断言指纹不同（`:147`）、两次均新建且套卷 ID 不同（`:148-150`）、资料库共 2 套卷和 8 张卡（`:153-155`）。`sample.test.ts:39-41` 先提取再对同一缓冲区计算哈希并断言 `byteLength` 未缩短，可直接捕获原缺陷。
- 非阻断观察：对话框路径峰值同时存在 `file.arrayBuffer()` 原始缓冲区、`bufferRef` 副本和 `pdf.ts` 内部副本，约 3 份；1.2 MB 样卷无实际影响，超大 PDF 可优化。由于 `pdf.ts` 已内部复制，对话框的 `slice(0)` 属于冗余防御，可改为直接保留原缓冲区或提前把指纹算成字符串。集成测试只断言两个指纹互异和缓冲区长度，未与独立计算的 SHA-256 比对；结合复制语义已足以覆盖本次缺陷。第二份 PDF 为原文件追加尾部注释，字节不同但提取内容相同，仍能验证文件级去重；它走浏览器 mock 数据层，Rust/SQLite 去重由既有 cargo 测试覆盖。

### ISSUE-2：通过

- 修复正确。`src/import/split.ts:540-546` 在 `parseSectionC` 返回 null 时调用 `fallbackArticle(readingLines, ...)`；`readingLines` 是 Part III 之后、Part IV 之前的完整内容（`split.ts:528-531`），Section A、B、C 原文均被保留。
- 用例命中真实分支。`src/import/split.test.ts:135-163` 构造同时含 Section A/B/C、但只有一个 Passage One 的文档，使 `splitReadingSections` 成功而 `parseSectionC` 失败；断言 raw 卡文本分别包含 A、B、C 三处片段（`split.test.ts:160-162`）。若回退为旧实现的 `sections.C`，A、B 断言会立即失败。
- 边界说明：兜底卡现在也包含 Section 标题和 Directions，符合“保留整段原文”的既有口径，不构成新问题。

### ISSUE-3：通过

- 标题行与首条陈述已区分。`src/import/split.ts:351-362` 中，命中独立 `Statements:` 行时 `hasStatementsHeading` 为真、`statementLines` 从下一行开始；命中首条陈述行时为假、`statementLines` 从该行本身开始，首条不会被 `+1` 排除。
- 三种变体均正确处理：
  - 标题行：检测见 `split.ts:354-355`，跳过标题见 `split.ts:359-362`。真实样卷第 9 页有独立 `Statements:` 行，`sample.test.ts:81-92` 断言 B 的陈述为 36–45 全部 10 条。
  - 带序号首条 `1. 36. ...`：检测正则见 `split.ts:355`，解析见 `split.ts:169-170`；`split.test.ts:56-71` 断言 36、37 均在陈述区，正文仍只有 A) 段。
  - 裸 `36. ...`：检测支持 36–45（`split.ts:355`），解析见 `split.ts:171-179`；`split.test.ts:73-87` 断言 36/37 均入陈述区且不混入正文，`split.test.ts:89-104` 断言首条裸题号可跨页续行。
- 非阻断观察：`hasStatementsHeading` 分支没有始终运行的单测，`split.test.ts:37-54` 是直接调用 `parseStatements` 的标题用例，未经过 `parseSectionB`；该分支另有环境变量门控的真实样卷用例。由于 `parseStatements` 自身也会跳过标题行，即使标志失效，除极少见的“标题与首条跨页”导致 pageRange 变化外结果不变。检测正则要求题号后至少一个空白，`36.` 单独成行或 `1.36.Text` 无空格形式不会被识别；两者不属于本次要求的三种变体，`parseStatements` 对单独题号同样无法解析，属既有边界而非本次修复引入。

### 结论

三项严重问题均已按修复方向解决，未发现由修复引入的功能性回归；上述内容均为非阻断优化或测试覆盖建议。R2 三项均通过。
