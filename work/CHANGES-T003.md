# T-003 改动清单 · 阶段 3 精读工作台

| 项 | 内容 |
|---|---|
| 任务 | T-003：词表标色 → 单词/多词选区工具条 → 模型接入 → 词卡/翻译/句法解析 → 段落与全文翻译 → 迟到响应隔离 → 错误重试 |
| 基线 | `553e599`（`docs: 阶段2验收通过，台账与项目清单更新`） |
| 分支 | `master` |
| 完成日期 | 2026-11-21 |
| 当前状态 | 代码完成，工作区改动尚未提交；`npm test`、`cargo test`、`npm run build` 通过；真实 Magpie 词卡/翻译/解析各调用一次成功 |
| 模型 | Magpie `http://127.0.0.1:3425/v1`，模型 `auto/deepseek-v4.1-flash`（OpenAI 兼容格式） |

## 1. 改动范围

### 1.1 新增文件

| 路径 | 内容 |
|---|---|
| `src/language/types.ts` | `ModelConfig`、`ChatTransport`、`ReadingTarget`、选区/词卡/翻译/解析结果与 `LanguageService` 类型 |
| `src/language/config.ts` | 默认模型配置（base/model/温度/超时）、base/model 的 `VITE_LANGUAGE_*` 覆盖入口、纯构造参数 API key 占位、URL 拼接 |
| `src/language/prompts.ts` | 词卡、翻译、句法解析三套提示词；词卡要求语境义、常见义、词形；解析要求主干、从句、修饰、搭配；翻译只输出译文 |
| `src/language/parse.ts` | OpenAI 响应取 content；词卡/解析 JSON 解析（兼容代码围栏、尾逗号、行式标签兜底）；翻译去标签/引号；字段归一化 |
| `src/language/transport.ts` | 浏览器 `fetch` 通道与桌面 Tauri 命令通道；超时、非 2xx、无效 JSON 的可读错误 |
| `src/language/service.ts` | 提示词 → 传输层 → 解析的组合式语言服务，传输层可注入 |
| `src/language/vocabulary.ts` | 四级词表样例、屈折形式候选、`VocabularyList` 可扩展接口、保留原文的 token 切分 |
| `src/language/targets.ts` | 选区/段落/全文三种请求目标构造函数；同一选区比较（文章 ID、版本、起止、原文） |
| `src/language/text.ts` | 单词判定、按段内偏移截取原句 |
| `src/language/useReadingAssistant.ts` | 精读侧栏会话：请求序号、目标核对、结果保留、错误重试、全文逐段翻译与单段重试、文章切换清空 |
| `src/reader/selection.ts` | 浏览器 Selection/Range 读取；跨标签、跨段落裁剪；首尾空白修剪；点击词表标记生成单词选区 |
| `src/reader/SelectionToolbar.tsx` | Floating UI 定位的选区工具条；单词显示“查看词卡”，短语/句子显示“翻译”“解析”；mousedown 保住选区 |
| `src/language/prompts.test.ts` | 3 个提示词构建用例 |
| `src/language/parse.test.ts` | 10 个响应解析用例（content 数组、错误体、围栏/尾逗号、标签兜底、翻译清洗、解析归一化） |
| `src/language/targets.test.ts` | 4 个请求目标与同选区比较用例 |
| `src/language/text.test.ts` | 3 个单词判定与原句截取用例 |
| `src/language/vocabulary.test.ts` | 3 个词表匹配与 token 切分用例 |
| `src/reader/selection.test.ts` | 4 个跨段/跨标签/空白修剪/标记点击选区用例 |
| `src/reader/ReadingAssistant.test.tsx` | 12 个组件用例：工具条、词卡原形/渲染与保留、翻译 pending 保留、迟到响应与拒绝、翻译后追加解析、跨段翻译、全文逐段重试及并发打断恢复、错误重试、切换文章/版本清空 |
| `src/language/realModel.test.ts` | 可选真实 Magpie 联调（`YUEJIAN_REAL_MODEL=1` 时执行，默认跳过） |
| `work/CHANGES-T003.md` | 本改动清单 |

### 1.2 修改的已有文件

| 路径 | 改动 |
|---|---|
| `src/App.tsx` | 接受可注入 `LanguageService`；创建精读会话；选区/段落/全文操作先展开侧栏再发请求 |
| `src/reader/ReaderView.tsx` | 四级词汇开关；词表标色渲染；关键字点击查看词卡；Selection 捕获；段落“本段翻译”；顶部“全文翻译”；选区工具条；切换文章/编辑/滚动时关闭工具条 |
| `src/reader/Inspector.tsx` | 渲染词卡（词、原句、语境义、常见义、词形）、译文、全文逐段结果、句法解析；翻译后追加解析；请求中保留旧结果；错误与逐段重试 |
| `README.md` | 阶段说明更新为阶段 3；补充模型接入（默认 Magpie、`VITE_LANGUAGE_*` 覆盖、桌面 Rust 通道、浏览器预览 CORS 限制、真实联调命令）与 `src/language`、`src/import` 目录职责 |
| `src/styles.css` | 词表标记、工具条、段落按钮、侧栏结果/错误/逐段重试行样式 |
| `src/App.test.tsx` | 词表标色会把段落文本拆成多个节点，原有按整段文本查询的断言改为读取 `p[data-i].textContent`（测试行为随阶段 3 DOM 变化，产品逻辑未变） |
| `package.json`、`package-lock.json` | 新增 `@floating-ui/dom@1.7.4`（MIT） |
| `src-tauri/Cargo.toml` | 新增 `reqwest@0.12`（`json`、`rustls-tls`） |
| `src-tauri/src/lib.rs` | 新增 `model_chat` 命令：桌面端发 HTTP、超时/连接/非 2xx/JSON 错误、空密钥不发 Authorization；新增 URL 校验与可选真实代理往返测试 |

### 1.3 未改动（回归基线）

`backend/`、`reader-preview/`、`项目方案.md`、`work/TASKS.md` 未改动。数据库结构与迁移未改；模型结果不落库。阶段 4 的收藏/复习未实现。

## 2. 实现要点

**模型层。** 默认配置固定为 `http://127.0.0.1:3425/v1` + `auto/deepseek-v4.1-flash`，base URL 和模型可通过构造参数或 `VITE_LANGUAGE_BASE_URL` / `VITE_LANGUAGE_MODEL` 覆盖。API key 只保留构造参数占位，不读取前端环境变量，也不写系统凭据存储。桌面端经 Rust `model_chat` 发出请求，避开 WebView 的 CORS 限制；浏览器预览退回 `fetch`，仅作开发入口。请求失败、超时、非 2xx 和无效 JSON 都转换为中文错误，由侧栏展示。

**选区。** `captureSelection` 从浏览器 Selection 读取 Range，按 `p[data-i]` 定位覆盖到的段落，对首段和末段分别裁剪 Range，中间段落取全文；因此跨标签（词表 `<mark>`）和跨段落选区都能得到准确的原段文字与绝对起止偏移。工具条用 `@floating-ui/dom` 的 `computePosition` + `flip` + `shift` 定位，窗口缩放时重算，定位失败时退回选区上方。工具条在 mousedown 时阻止默认行为，选区快照已先保存，按钮不会夺焦丢失原文。滚动、Esc、点击工具条外部或切换文章时关闭工具条。

**请求目标与迟到响应隔离。** 每个请求生成 `ReadingTarget`，携带文章 ID、正文版本、查找起点/终点（段落 + 段内偏移）、覆盖段落和操作类别。会话内用递增序号标记最新请求；响应返回时必须同时满足“序号仍是最新”和“文章 ID/版本与发起时一致”，否则丢弃。新请求开始时只记录 pending，不清空已显示结果；成功后才替换。切换文章或正文版本变化时，侧栏用文章/版本 key 立即隐藏旧结果，不等副作用执行，并且旧的迟到响应会被目标核对拒绝。

**词卡与侧栏。** 词卡标题优先使用模型返回的原形，缺失时回退到所选词；同时显示原句、语境义、常见义、词形和可选音标/词性；原句由本地按选区偏移截取，避免模型编造。短语/句子翻译显示原文与译文；同一选区翻译后再点解析，解析结果追加在译文下方（`TranslationResult.analysis`）。“本段翻译”直接发整段请求；顶部“全文翻译”按段落拆成并行请求，全部返回后按原文顺序展示，全部失败时保留旧结果并给出整条重试，部分失败时逐段显示错误与“重试本段”；单段重试带独立序号，不会覆盖新请求。

**词表标色。** `VocabularyList` 是后续完整词表的接入点；内置四级样例按本地关键词匹配，并处理常见复数/过去式/现在分词及双写辅音。`tokenizeWithVocabulary` 只插入标记，不改变任何字符，选区偏移和跨段读取不受标色影响。顶部开关控制是否渲染标记；标记可点击直接查看词卡。

**错误与本地编辑。** 所有模型调用只在用户动作后发生，失败只影响侧栏，不阻断本地编辑、保存、分区和文章切换。词卡/翻译/解析失败显示错误与“重试”；全文翻译支持逐段重试。模型结果不写入 SQLite，阶段 3 仅保留当前侧栏会话。

## 3. 验证

### 3.1 自动化

| 命令 | 结果 |
|---|---|
| `npm test` | 14 个测试文件：12 通过、2 跳过（既有 PDF 样卷可选回归、真实模型联调默认跳过）；**72 通过、3 跳过，共 75 项** |
| `cargo test` | **17 通过、1 忽略**（忽略项为需要本机 Magpie 的真实往返测试） |
| `cargo test model_chat_round_trip -- --ignored` | **1 通过**；Rust `model_chat` 命令经 Magpie 真实返回内容 |
| `cargo build` | 通过；Tauri 调试二进制链接成功 |
| `npm run build` | 通过；`tsc --noEmit` 无错误，Vite 产物正常 |

关键用例：

- 迟到响应：先请求 address、problem、meeting 三张词卡；先返回 meeting，再返回 problem，address 保持未结算，侧栏始终显示 meeting，旧词卡不覆盖。另有直接用例验证最新词卡完成后，旧请求 reject 不恢复旧错误。
- 结果保留：新词卡请求 pending 期间旧词卡仍在；新译文 pending 期间旧译文仍在；只有成功响应才替换。
- 跨段划选：从第 1 段 `address` 到第 2 段 `address`，请求目标为 `{start:{paragraph:0,offset:11}, end:{paragraph:1,offset:25}}`，原文按两段拼接。
- 翻译后追加解析：同一选区翻译后发解析，解析完成时译文与语法解析同时存在。
- 全文翻译：两段并行，第一段成功、第二段失败时按段落展示；单段重试后补齐；单段重试被其他失败请求打断后恢复原错误，仍可重试。
- 切换文章/版本：旧 pending 立即清空；同文章 v1→v2 也隐藏旧结果，迟到响应返回后侧栏仍为空。

### 3.2 真实 Magpie 响应样例（2026-11-21）

调用方式：`YUEJIAN_REAL_MODEL=1 npx vitest run src/language/realModel.test.ts --reporter=verbose`，共 3 次请求，13.1 秒。服务返回模型标识 `group/auto-deepseek-v4-1-flash`，`finish_reason=stop`。

**词卡请求。** 单词 `address`，原句 `We need to address the problem before the meeting.`，请求 ID `as-gf9zf2i2r4`，usage：prompt 234 / completion 147 / total 381（reasoning 74）。

原始 `message.content`：

```json
{"word":"address","phonetic":"/əˈdres/","partOfSpeech":"v.","contextualMeaning":"着手处理，解决（问题）","commonMeaning":"地址；演说；称呼","forms":["第三人称单数: addresses","过去式: addressed","过去分词: addressed","现在分词: addressing","复数: addresses"]}
```

解析后侧栏数据：

```json
{
  "kind": "word",
  "word": "address",
  "phonetic": "/əˈdres/",
  "partOfSpeech": "v.",
  "contextualMeaning": "着手处理，解决（问题）",
  "commonMeaning": "地址；演说；称呼",
  "forms": ["第三人称单数: addresses", "过去式: addressed", "过去分词: addressed", "现在分词: addressing", "复数: addresses"]
}
```

**翻译请求。** 选区 `We need to address the problem before the meeting.`，请求 ID `as-04pu02vgge`，usage：prompt 114 / completion 152 / total 266（reasoning 144）。

原始 `message.content`：

```text
我们需要在会议前处理这个问题。
```

解析后 `translation` 与原文一致，`source` 保留英文选区，`mode=selection`。

**句法解析请求。** 选区 `The city street looks different on foot, and residents say walkability matters more than parking.`，请求 ID `as-dcft8eg1fi`，usage：prompt 207 / completion 1011 / total 1218（reasoning 734）。

原始 `message.content`（完整 JSON 字符串；为便于阅读按 JSON 缩进展示，字段值未改）：

```json
{
  "trunk": "并列句：第一分句主语为 The city street，系动词为 looks，表语为 different，方式状语为 on foot；第二分句主语为 residents，谓语为 say，宾语为省略 that 的宾语从句 walkability matters more than parking（该从句主语 walkability，谓语 matters，比较状语 more than parking）。",
  "clauses": [
    {
      "text": "walkability matters more than parking",
      "explanation": "宾语从句，省略了引导词 that，作 say 的宾语；其中 walkability 作主语，matters 作谓语，more than parking 作比较状语。"
    }
  ],
  "modifiers": [
    "on foot 作方式状语，修饰 looks，表示“步行时/从步行角度看”",
    "different 作表语，说明主语 The city street 的特征",
    "city 作名词定语修饰 street，表示“城市街道”",
    "more than parking 作比较状语，修饰 matters，表示重要程度超过 parking",
    "The 为限定词，限定 city street"
  ],
  "collocations": [
    { "phrase": "on foot", "meaning": "步行；徒步" },
    { "phrase": "look different", "meaning": "看起来不同" },
    { "phrase": "city street", "meaning": "城市街道" },
    { "phrase": "more than", "meaning": "比……更；超过" },
    { "phrase": "matters more than parking", "meaning": "比停车更重要" }
  ]
}
```

解析结果逐项进入侧栏的“语法主干 / 从句 / 修饰关系 / 短语搭配”，未出现空字段展示。

## 4. 待验与后续

- **桌面界面人工验收**：需在 Tauri 窗口中实际拖选单词、短语、跨段文字，确认 Floating UI 工具条位置、侧栏宽度与正文滚动位置；本次自动化覆盖了选区读取和组件渲染，但未用鼠标在真实 WebView2 窗口操作。
- **浏览器预览限制**：Magpie 未返回 CORS 头，浏览器预览的 `fetch` 通道会显示“无法连接模型服务”；桌面版走 Rust 通道，已用真实 Magpie 往返测试验证。预览仅用于界面开发。
- **完整词表**：内置四级样例只覆盖常见词；六级/考研词表与重叠类别图例待后续补数据，`VocabularyList` 接口已预留。
- **阶段 4**：收藏词语/长难句、快照去重、复习排程与 AI 重点词不在本次范围。
- **真实响应波动**：以上样例来自 2026-11-21 的本机 Magpie；模型供应商或版本变化时结果措辞可能不同，解析器已兼容围栏、尾逗号与行式词卡兜底。