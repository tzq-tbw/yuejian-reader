# T-003 阶段 3 精读工作台独立审查

审查日期：2026-11-21。审查方式为只读代码审查、前端自动化测试和 Rust 桌面通道的一次真实 Magpie 调用；未修改产品代码。

## 结论

核心需求已落实：跨标签/跨段选区、可控乱序下的迟到响应隔离、文章 ID/版本 key、R2 保留上一次结果、Inspector 渲染、桌面模型命令和词表标色均有有效实现。未发现模型结果写入 SQLite 的路径，未发现阻断阶段 3 验收的严重问题。

## 严重

无。

## 建议

### 1. 自定义密钥不应通过 `VITE_LANGUAGE_API_KEY` 进入前端构建产物

`src/language/config.ts:31-32` 允许从 `VITE_LANGUAGE_API_KEY` 读取密钥，`README.md:33` 也将它作为公开配置入口；随后密钥会进入浏览器请求头或经前端传给 Tauri（`src/language/transport.ts:24-26`、`src/language/transport.ts:71-80`）。Vite 的 `VITE_*` 值会嵌入前端 JavaScript，不能作为自定义供应商密钥的安全存储。

默认 Magpie 配置为空密钥，Rust 也只在非空时添加认证头（`src/language/config.ts:8-14`、`src-tauri/src/lib.rs:78-81`），所以默认链路没有密钥泄漏。建议在接入系统凭据存储前，把 API key 保持为纯类型/构造占位，不文档化或启用 `VITE_LANGUAGE_API_KEY`，与 `work/TASKS.md:97-100` 的决策边界保持一致。

### 2. 单段重试被另一请求打断时，旧全文结果可能留下空白且无法重试的行

代码路径显示：单段重试开始会先把该行改为 `error: null, loading: true`（`src/language/useReadingAssistant.ts:333-348`）。若此时再发起词卡等其他请求，新序号使重试响应失效，而 `withoutRowLoading` 只把 `loading` 改回 `false`，不会恢复原错误（`src/language/useReadingAssistant.ts:48-55`、`src/language/useReadingAssistant.ts:125-149`）。若新请求失败并保留旧全文结果，该行会进入普通译文分支，但译文和错误均为空，也没有“重试本段”入口（`src/reader/Inspector.tsx:66-82`）。

这是并发操作边界，不影响已验证的普通全文翻译/单段重试流程。建议保留重试前行快照，或在使单段重试失效时恢复可重试状态，并补一条“单段重试中发起其他请求且后者失败”的组件用例。

### 3. 词卡提示词要求返回原形，但服务层丢弃了模型返回的原形

提示词将 `word` 定义为“选中的单词原形”（`src/language/prompts.ts:24-31`），解析器也读取 `word/lemma/term`（`src/language/parse.ts:199-220`），但最终结果固定使用 `input.word`（`src/language/service.ts:50-66`）。因此选择 `addresses` 时，即使模型正确返回 `address`，侧栏标题仍是 `addresses`（`src/reader/Inspector.tsx:20-35`）。

若词卡设计需要 lemma，建议使用解析后的 `parsed.word`；若设计上保留原选词，则应调整提示词，避免模型做无效工作并造成契约误解。补一个屈折形式输入的测试即可锁定预期。

### 4. R2 和文章版本隔离的实现成立，但直接回归覆盖还不完整

现有乱序测试直接使用可控 deferred Promise：第三次请求先返回，第二次旧请求后返回并断言不能覆盖（`src/reader/ReadingAssistant.test.tsx:31-39`、`src/reader/ReadingAssistant.test.tsx:245-297`），不是固定延时或立即 resolve 的伪乱序测试。

还建议补以下直接覆盖：

- “旧译文 → 新译文 pending 期间保留旧译文”。当前直接覆盖的是“旧词卡 → 新词卡 pending”（`src/reader/ReadingAssistant.test.tsx:263-271`）和“译文 → 追加解析 pending”（`src/reader/ReadingAssistant.test.tsx:299-346`）；通用实现虽能保留所有结果类型，但交付说明中的“翻译 pending 期间旧译文仍在”没有同名场景测试。
- 同一文章 ID、版本从 v1 变为 v2 时立即隐藏旧结果，并拒绝旧响应。当前组件测试只覆盖切换不同文章（`src/reader/ReadingAssistant.test.tsx:407-430`），版本 key 分支仅由代码审查确认（`src/language/useReadingAssistant.ts:61-63`、`src/language/useReadingAssistant.ts:95-108`、`src/language/useReadingAssistant.ts:422-436`）。
- 最新请求已完成后，旧请求 reject 也不恢复旧错误。成功响应路径已测，拒绝路径共用 `isCurrent`，但增加用例可防止后续改坏。

另外，`work/CHANGES-T003.md:84-87` 描述 address、problem 都随后返回；实际测试只再返回 problem，第一次 address deferred 未结算（`src/reader/ReadingAssistant.test.tsx:273-297`）。不影响当前断言有效性，但交付说明应改成实际覆盖范围，或把 address 的迟到返回也补上。

### 5. 传输错误映射实现完整，自动化主要覆盖成功路径，建议补本地 HTTP 故障桩

浏览器通道有超时、非 2xx、非法 JSON 和连接错误处理（`src/language/transport.ts:17-60`），Rust 通道有连接/总超时、发送/读取/状态码/JSON 错误映射（`src-tauri/src/lib.rs:64-106`）。但 Rust 自动化目前只有 URL 校验和默认忽略的真实成功往返（`src-tauri/src/lib.rs:242-286`），前端也没有对应的 transport 测试文件。

建议用本地可控 HTTP 服务或注入 stub 覆盖超时、连接拒绝、非 2xx 响应摘要、非法 JSON，以及空密钥不发 `Authorization`、非空密钥才发送。这样无需访问真实供应商，也不会把密钥写入测试日志。

## 确认可行

### 1. 提示词、解析容错与服务可替换性

- 词卡提示词包含原句和所在段落，明确区分语境义、常见义和词形；翻译要求只输出译文并保留段落；解析明确要求主干、从句、修饰和搭配，且不要补造不存在的结构（`src/language/prompts.ts:17-48`、`src/language/prompts.ts:51-101`）。跨段选区传入的是裁剪后的片段，不是未选中的完整首尾段（`src/reader/selection.ts:142-149`、`src/language/useReadingAssistant.ts:174-205`）。
- OpenAI content 提取支持字符串、content 数组、API 错误体和 `finish_reason=length`（`src/language/parse.ts:114-152`）。词卡兼容代码围栏、尾逗号、字段别名和行式标签兜底；翻译清理围栏/标签/包裹引号；句法结果做空字段归一化并拒绝空结果（`src/language/parse.ts:70-97`、`src/language/parse.ts:184-255`、`src/language/parse.ts:257-317`）。对应测试见 `src/language/parse.test.ts:10-143`。
- `ChatTransport` 是独立接口，服务通过构造参数注入 transport/config，组合提示词、传输和解析，没有把 Magpie 写死在业务 hook 中（`src/language/types.ts:28-34`、`src/language/service.ts:23-46`）。默认通道按 Tauri 环境选择 Rust 或 fetch（`src/language/transport.ts:86-94`）。

### 2. 划词链路和工具条

- `captureSelection` 要求起止都位于正文 `p[data-i]`，逐段裁剪 Range；首尾用 Range 重新测量段内绝对偏移，中间段取全文，因此 `<mark>` 不会破坏文本和偏移（`src/reader/selection.ts:54-109`）。首尾空白修剪同步调整 anchor，最终按 `\n\n` 拼接并保留逐段切片（`src/reader/selection.ts:112-151`）。跨段和跨标记测试有明确文本及 offset 断言（`src/reader/selection.test.ts:25-76`）。
- 点击词表标记不依赖当前 Selection，而是直接从段落起点测到 mark，构造单词目标（`src/reader/selection.ts:154-183`）。
- 工具条使用 Floating UI 的 `flip`、`shift` 和 resize 重算，定位失败有退回位置；`mousedown` 阻止默认行为以保住选区（`src/reader/SelectionToolbar.tsx:38-120`）。正文滚动、Esc、工具条外 pointerdown、文章切换和进入编辑都会关闭旧工具条（`src/reader/ReaderView.tsx:81-108`、`src/reader/ReaderView.tsx:192`、`src/reader/ReaderView.tsx:284-300`）。

### 3. 迟到响应隔离是真闭环，乱序测试使用可控延迟桩

- 每次普通请求递增全局 `seqRef`；响应成功和失败都必须通过 `isCurrent`，同时满足序号仍最新、当前文章 ID 与 target 相同、正文版本相同（`src/language/useReadingAssistant.ts:101-150`）。因此旧选区即使晚返回，也无法覆盖新选区。
- 文章/版本身份在 render 期间同步更新并清掉结果引用，effect 再使旧序号失效；返回给 UI 前还用 `state.key === currentKey` 隐藏旧状态，不等待 effect（`src/language/useReadingAssistant.ts:85-108`、`src/language/useReadingAssistant.ts:422-436`）。
- 全文翻译和单段重试也递增同一序号并核对文章 ID/版本；全文结果按原段落顺序组装（`src/language/useReadingAssistant.ts:235-307`、`src/language/useReadingAssistant.ts:310-419`）。
- 测试的 `defer()` 把每次 Promise 的 resolve/reject 暴露给测试，第三次 meeting 先完成，第二次 problem 后完成，最终仍断言 meeting 且 problem 不存在（`src/reader/ReadingAssistant.test.tsx:31-69`、`src/reader/ReadingAssistant.test.tsx:273-297`）。这是真实可控乱序验证。

### 4. R2“翻译下一个词之前保留上一次结果”已落实

普通请求开始只更新 pending/error，并从同文章版本的 previous state 保留 result；只有最新成功响应才替换结果。最新失败也保留 previous result，同时显示错误和重试（`src/language/useReadingAssistant.ts:125-150`）。切换文章/版本清空是单独且符合要求的例外。

Inspector 将 pending、error 和 result 独立渲染，旧结果不会因 pending 被条件分支移除（`src/reader/Inspector.tsx:187-217`）。词卡 pending 保留旧词卡、解析 pending 保留译文均有组件断言（`src/reader/ReadingAssistant.test.tsx:263-271`、`src/reader/ReadingAssistant.test.tsx:323-345`）。翻译后解析会基于同一文章、版本、起止、段落和原文匹配，再把 analysis 追加到原译文结果（`src/language/targets.ts:57-68`、`src/language/useReadingAssistant.ts:188-216`）。

### 5. Inspector 和全文翻译渲染

词卡展示词、原句、语境义、常见义和可选词形/音标/词性；选区/段落翻译展示原文与译文；句法解析按主干、从句、修饰、搭配渲染；全文按段展示原文、译文、错误和单段重试（`src/reader/Inspector.tsx:20-185`）。原文和译文样式使用 `white-space: pre-wrap`，跨段换行不会折叠（`src/styles.css:816-817`）。

### 6. Rust `model_chat` 超时、错误和默认密钥处理

桌面命令设置 8 秒连接超时和可配置总超时，并将超时、连接、发送、响应读取、非 2xx 和非法 JSON 转为可读中文错误（`src-tauri/src/lib.rs:62-106`）。空密钥不添加 Authorization，非空密钥仅用于当前请求头；实现中未见密钥写文件、写数据库或日志（`src-tauri/src/lib.rs:56-60`、`src-tauri/src/lib.rs:71-94`）。自定义 `VITE_*` 密钥入口的构建泄漏风险已单列为建议 1。

### 7. 词表标色保留原文和选区偏移

词表接口可替换，内置样例支持常见复数、过去式、现在分词和双写辅音候选（`src/language/vocabulary.ts:8-18`、`src/language/vocabulary.ts:105-150`）。`tokenizeWithVocabulary` 只切分文本并附加 match，不重写字符；Reader 仅把命中 token 包成 `<mark>`，未命中内容原样渲染（`src/language/vocabulary.ts:153-175`、`src/reader/ReaderView.tsx:200-240`）。测试验证拼接后与原文逐字符一致（`src/language/vocabulary.test.ts:8-28`）。完整四级/六级词表仍是交付说明列明的后续数据工作，不将其误认为完整词库。

### 8. 模型结果不落库

模型调用结果只进入 `useReadingAssistant` 的 React state/ref（`src/language/useReadingAssistant.ts:85-99`、`src/language/useReadingAssistant.ts:135-150`），Rust `model_chat` 只执行 HTTP 并返回 JSON（`src-tauri/src/lib.rs:61-107`）。调用链中没有 `ReaderApi` 写操作或 SQLite 写入；`src/language/types.ts:1-5` 也明确限定为当前侧栏会话。本次检索未发现模型结果持久化路径，符合 T-003 要求。

## 实际验证

- `npm test`：14 个测试文件中 12 通过、2 跳过；70 项中 **67 通过、3 跳过**。跳过项为既有可选 PDF 样卷回归 2 项和默认关闭的真实模型联调 1 项。
- `cargo test model_chat_round_trip -- --ignored`：**1 通过、0 失败**。该用例经 Rust `model_chat` 向本机 Magpie 发出一次真实请求并断言返回内容非空（`src-tauri/src/lib.rs:265-286`）。
- 本次未在真实 WebView2 窗口中用鼠标验收工具条位置和拖选手感；这仍是 `work/CHANGES-T003.md:161-164` 所列的人工验收项，不在上述自动化通过结论内。

## R2 修复记录

1. **密钥入口**：`src/language/config.ts` 不再读取 `VITE_LANGUAGE_API_KEY`，`apiKey` 仅接受构造参数并回退默认空字符串；`README.md` 与交付说明同步删除该环境变量入口。base URL 和模型名的环境变量覆盖保持不变。
2. **单段重试打断恢复**：`src/language/useReadingAssistant.ts` 在逐段重试前保存该行快照；新请求使重试序号失效时，先恢复该行原错误和译文状态，再保留旧全文结果。重试成功或失败后清理快照，文章/版本切换时直接丢弃。`src/reader/Inspector.tsx` 对非 loading、无错误但译文为空的行也保留“重试本段”入口。
3. **词卡原形**：`src/language/service.ts` 的 `word` 改为优先使用 `parsed.word`，为空时回退 `input.word`。新增组件用例经真实服务组合层和响应解析验证：选择 `addresses` 后侧栏标题显示 `address`。
4. **直接回归覆盖**：新增“新译文 pending 保留旧译文”“同文章 v1→v2 立即隐藏并拒绝旧响应”“最新完成后旧请求 reject 不恢复旧错误”“单段重试被其他失败请求打断后仍可重试”用例。`work/CHANGES-T003.md` 的乱序说明已改为实际行为：meeting 先返回、problem 后返回，address 保持未结算。

验证结果：`src/reader/ReadingAssistant.test.tsx` 12 项全部通过；完整 `npm test` 为 **72 通过、3 跳过（共 75 项）**，跳过项仍是既有可选 PDF 样卷 2 项和默认关闭的真实模型联调 1 项；`npm run build` 通过，TypeScript 检查与 Vite 构建均成功。建议 5 未改动。

## R2 反审记录

反审日期：2026-11-21。只读核验 Kimi 对建议 1-4 的修复，未修改产品代码。独立执行 `npm test`（72 通过、3 跳过，共 75 项）、`npx vitest run src/reader/ReadingAssistant.test.tsx`（12 项全部通过）和 `npm run build`（`tsc --noEmit` + Vite 构建通过），与修复记录一致。

### 1. 密钥入口删除 —— 通过

- `src/language/config.ts:31` 的 `apiKey` 只接受 `overrides.apiKey` 并回退默认空字符串；`VITE_LANGUAGE_API_KEY` 已不在任何产品源码、测试或类型注释中。全库检索仅剩 `work/REVIEW-T003.md` 与 `work/TASKS.md` 两处审查/决策记录提到该变量名，不构成配置入口。
- `README.md:33` 明确写明“API key 仅保留构造参数占位，不提供前端环境变量入口”；`src/language/types.ts:16` 的注释仍是“占位配置”。base URL 和模型名的 `VITE_LANGUAGE_*` 覆盖保持原样，范围正确。

### 2. 单段重试快照恢复 —— 通过

- 重试开始时在 `src/language/useReadingAssistant.ts:379-397` 保存该行快照并把行置为 loading；任何新请求在递增序号前先调用 `restoreInterruptedParagraphRetry`（`execute` 的 `:164-165`、`translateArticle` 的 `:280`、`retryParagraph` 的 `:352`）。恢复函数（`:109-138`）核对文章/版本 key、article 模式和该行仍为 loading 后，把原 error/translation 写回 `resultRef` 和 state；文章或版本切换在渲染期与 effect 中直接丢弃快照（`:102-107`、`:477-480`）。重试成功/失败只在序号仍匹配时清理快照（`:401-409`、`:421-423`、`:451-453`），迟到响应不会覆盖。
- 组件用例 `src/reader/ReadingAssistant.test.tsx:508-561` 真实覆盖目标场景：全文翻译第二段失败 → 点“重试本段” → 发起词卡请求并让其失败 → 断言原错误“本段翻译失败：网络不可用”恢复、旧重试 reject 被忽略 → 再次“重试本段”成功并清除错误。该断言不能由 Inspector 的空译文兜底分支（`src/reader/Inspector.tsx:82-92`）满足：若无快照恢复，该行会变成“本段暂无译文，请重试。”而不是原错误，因此用例确实锁定快照恢复行为。
- 恢复逻辑只在最新结果仍是同 key 的 article 结果时生效，否则清空快照；单槽快照在“连续重试不同段落”时也会先恢复上一行再覆盖，未见遗漏路径。

### 3. 词卡原形回退 —— 通过

- `src/language/service.ts:59` 改为 `word: parsed.word || input.word`。解析器本身在 JSON 缺少 `word/lemma/term` 时已回退 `fallback.word`（`src/language/parse.ts:214`、`:233-234`），因此原形优先、空值回退的链路正确，标签兜底路径仍使用本地所选词。
- 组件用例 `src/reader/ReadingAssistant.test.tsx:246-290` 选择 `addresses`（偏移 6-15），经真实 `createLanguageService`、真实提示词/解析，仅替换传输层返回 `word: "address"`，断言侧栏标题为 `address` 且不存在 `addresses` 标题。若服务仍固定使用 `input.word`，标题会是 `addresses`，用例会失败，覆盖有效。`src/language/parse.test.ts:65-93` 另有解析层字段用例。

### 4. 三条新增回归测试 —— 通过

- **旧译文保留**（`src/reader/ReadingAssistant.test.tsx:371-398`）：第二次同选区翻译 pending 时断言“旧译文”仍在且 pending 可见，成功后断言“新译文”出现、“旧译文”消失。直接覆盖译文类型，不再只靠词卡用例。
- **同文章 v1→v2**（`src/reader/ReadingAssistant.test.tsx:588-613`）：通过编辑保存把同一文章版本自增（`src/data/mock.ts:427-433`），在旧响应未结算前断言侧栏内容已清空，再结算旧响应仍断言无词卡。文章 ID 不变，只有版本变化，确实走版本 key 分支；若版本未隔离，pending 会残留，用例会失败。
- **旧请求 reject 不恢复错误**（`src/reader/ReadingAssistant.test.tsx:346-369`）：最新词卡完成后旧请求 reject，断言最新词卡仍在、侧栏无 alert、无“旧请求失败”文本。拒绝路径的 `isCurrent` 守卫被直接锁定。

### 新问题检查 —— 未发现本轮修复引入的新问题

四项修复没有改变请求目标、结果替换或渲染分支的既有契约；全套测试与构建通过。另有一处与本轮修复无关的既有边界供后续参考：`retryParagraph` 启动时只覆盖 `result/error` 并保留 `previous.pending`（`src/language/useReadingAssistant.ts:393-397`），同时递增序号使另一在途请求失效（`:375`、`:401-409`）。因此在“词卡请求 pending、旧全文结果仍显示”时点击“重试本段”，词卡请求被静默丢弃，但“正在生成词卡…”会一直保留到下一次请求。该入口在 R2 之前就存在（旧结果在 pending 期间一直显示，错误行一直有重试按钮），不属于建议 1-4 的回归，建议后续单独处理。

## R3 反审记录

反审日期：2026-11-21。只读核验 Kimi 的 T-R3a/T-R3b 两项修改，未修改产品代码。独立执行 `npm test`（12 个文件通过、2 个跳过；75 项通过、3 项跳过）、`npx vitest run src/language/vocabulary.test.ts`（6 项全部通过）和 `npm run build`（`tsc --noEmit` + Vite 构建通过），与 `work/FIX-T003-R3.md:19-20` 的验证结果一致。

### 1. 词表接口兼容性 —— 通过（一处导出面变化）

- `VocabularyList`、`VocabularyMatch`、`TextToken` 的字段未变（`src/language/vocabulary.ts:5-21`）；`candidates` 逻辑未变（`src/language/vocabulary.ts:23-45`）；`vocabularyMatches`、`tokenizeWithVocabulary` 的参数、默认值和返回类型未变（`src/language/vocabulary.ts:77-108`）。`DEFAULT_VOCABULARY_LISTS` 仍是 `readonly VocabularyList[]`，只是内容扩为三表（`src/language/vocabulary.ts:70-75`）。正文消费方只依赖 `tokenizeWithVocabulary`（`src/reader/ReaderView.tsx:13`、`src/reader/ReaderView.tsx:222`），无需改动。
- 唯一 API 表面变化是删除旧导出 `CET4_SAMPLE_LIST`（及内部样例数组），新增 `CET4_LIST`/`CET6_LIST`/`POSTGRADUATE_LIST`，标签从“四级词汇”改为“四级高频”。全库检索显示旧导出仅被 `vocabulary.test.ts` 引用，没有生产调用点，所以不构成仓库内兼容性破坏；若把模块导出视为对外契约，这是一次有意删除/重命名，交付说明已写明。
- 新增 `cet6`/`ky` 两个 id 会进入 `<mark className="vocabMark ...">` 和标题（`src/reader/ReaderView.tsx:226-231`），现有 CSS 没有按 id 限定的规则，不会因新 id 产生意外样式。

### 2. 测试覆盖 —— 通过（6 用例覆盖目标，余一处小缺口）

- `src/language/vocabulary.test.ts` 确有 6 个用例（`:15`、`:23`、`:31`、`:39`、`:58`、`:69`）：三表各 1600 词、无重复、纯小写字母；默认三表同时启用；`address` 的屈折匹配；重叠词在 `vocabularyMatches` 和 `tokenizeWithVocabulary` 中返回 `cet4/cet6/ky` 三个 id 与三个中文标签，并验证 token 拼接还原原文；任意子集独立开关及空列表；未命中返回空。三表、重叠、开关均有直接断言。
- 小缺口：独立开关用例只用了三表共同词 `address`，没有用只属于单表的词锁定“单一类别”行为。词表中存在 `exactly`（仅四级）、`environmental`（仅六级）、`labor`（仅考研）等样例，补一条单表命中用例即可覆盖。属建议补强，不影响本轮验收。

### 3. 词表数据质量 —— 通过（口径注释有两处不精确）

- 我从 ECDICT 固定提交 `39cfb9672c0906b63569e0453c2e6abfb9ab182a` 下载完整 `ecdict.csv`（66,009,548 字节、770,611 行），按文件头描述复现筛选：对 `cet4`/`cet6`/`ky` 标签（候选分别 3,837、5,396、4,801 行），词形统一小写后仅保留 `[a-z]+`，排除 `frq=0`，按 `(frq, bnc, word)` 升序取前 1600。三份词表与复现结果逐项一致（各 1600/1600 全部相同），来源、版本和筛选可复现，不是手工拼凑。
- 高频性：三表末位词的当代语料库频率排名分别为 2907（四级 `elderly`）、3123（六级 `eager`）、2947（考研 `shelf`），表中前部为 `state`/`might`/`part`/`system` 等常见高频词，整体在语料库前约 3100 名内，符合“考试高频词表”定位。
- 完整性：三表各 1600 词、无重复、全部 `^[a-z]+$`；抽查未见乱码、中文、空格、标点、空项或跨表复制错误。`ad`（四级）和 `tv`（考研）是 ECDICT 收录的缩写，`african`/`christian`/`latin`/`god` 等是源库大写专名统一小写后的结果；它们都是合法的 ECDICT 词条，不是损坏数据，但若产品要求只收普通词汇，这两类需要产品另行决定是否剔除。
- 口径注释不精确：文件头只写“按 frq 升序取前 1600”，实际还排除了 `frq=0` 并统一了小写；按字面把 `frq=0` 纳入排序会得到不同列表。建议把头注补成“先排除 frq=0，并将源词条统一小写，再按 (frq, bnc, word) 升序取前 1600”。
- 分布观察：三表并集 1833 词，其中 1298 词同时命中三表、371 词命中两表、仅 164 词单表。默认三表开启时大多数标记会显示三个类别；这与“重叠词保留全部命中类别”的验收一致，但“六级/考研”标签的区分度较低。另注意当前 `<mark>` 的类别只进入 `className` 和 `title`，`.vocabMark` 仍只有统一样式（`src/styles.css:761-762`）；若任务中的“按词表归属分类标色”要求视觉颜色区分，这部分尚未实现。

### 4. 工具条高对比配色范围 —— 通过

- 与配色相关的代码只有 `src/reader/SelectionToolbar.tsx:92` 新增 `data-theme="high-contrast"`，以及 `src/styles.css:776-792` 的 17 行新规则。`git diff HEAD` 未显示其他组件或全局样式改动；新增选择器全部以 `.selectionToolbar[data-theme="high-contrast"]` 限定，不会影响弹窗、其他气泡或词表标记。
- 对比度实测：白字/深蓝底 `#153f73` 约 10.55:1（WCAG AAA），悬停白字/品牌蓝 `#2c65be` 约 5.66:1（WCAG AA），焦点轮廓为白色；Lucide 图标使用 `currentColor`，随文字变白。深蓝边框与背景对比约 1.31:1，仅作装饰，不承担文字可读性。构建通过，未见 CSS 语法或选择器优先级问题。
- 未在真实 WebView2 窗口做肉眼验收；该项仍属人工验收，不在本轮代码核验结论内。

### 结论

两项修改均达到 R3 目标，未发现阻塞问题。词表函数与类型签名确实未变，6 个用例覆盖三表/重叠/开关；数据可由 ECDICT 固定提交精确复现；配色只改动了指定组件的两处文件。待处理的都是低优先级项：补一个单表命中测试用例、修正词表头注的 `frq>0`/小写口径、确认是否需要按类别做视觉标色，以及同步仍写着“内置四级样例/完整词表待后续”的 `work/CHANGES-T003.md:68`、`:165`。核验用的 ECDICT 临时文件已清理，未进入仓库。

验证结果：`npm test` 75 通过、3 跳过（共 78 项）；词汇测试 6/6 通过；`npm run build` 通过。
