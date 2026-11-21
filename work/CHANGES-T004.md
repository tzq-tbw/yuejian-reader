# T-004 改动清单 · 阶段 4 收藏与复习

| 项 | 内容 |
|---|---|
| 任务 | T-004：生词本 / 长难句本 → 快照与去重 → 按日排程 → 两个复习窗口 → 复习页与 AI 重点词 |
| 基线 | `ee9caf5`（阶段 3 三套高频词表与工具条配色收官） |
| 分支 | `master` |
| 完成日期 | 2026-11-21 |
| 当前状态 | 代码完成，工作区改动尚未提交；`npm test`、`cargo test`、`npm run build` 通过 |
| 范围约束 | 未做安装包；未改 `backend/`、`reader-preview/`、`work/TASKS.md`；工作区原有的 `项目方案.md` 一行改动保持原样，未由本任务改写 |

## 1. 数据层

### 1.1 迁移 `0004_collection_review.sql`

新增四张表：

- `word_favorites`：展示词形、规范化词形、原句快照、规范化原句、来源文章 ID 与标题快照、段落起止、语境义、常见义、音标、词性、词形。唯一索引为 `(normalized_word, normalized_sentence)`。
- `long_sentence_favorites`：原选区快照、`source_key`、译文、解析 JSON、来源文章与标题快照、段落起止、创建/更新时间。`source_key` 由文章 ID、段落起止和规范化原文组成并唯一。
- `review_schedules`：词卡 ID 主键/外键级联、间隔阶段、到期本地日期、实际完成日。索引在 `due_date`。
- `review_events`：词卡 ID、轮次、揭晓 ID、评分、本地日期、写入时间；`UNIQUE(reveal_id)` 保证同一次揭晓只记一次。

文章删除时收藏的 `article_id` 置空，标题与原句快照保留；删除词卡级联删除排程与事件，活动队列随之清空。

### 1.2 Rust（`db.rs`、`review.rs`、`lib.rs`）

- 规范化：`split_whitespace().join(" ")` + 小写，合并连续空白、忽略英文大小写，保留词序与标点。
- `add_word_favorite`：在事务内按规范化组合键查重；已存在时返回原记录，不覆盖旧快照；新记录同时建立阶段 0、次日到期的排程。收藏日期由前端传本机日历日，后端计算次日。
- `add_long_sentence_favorite`：同一文章、同一段落范围、同一规范化原文复用已有记录；`translation`/`analysis` 缺失时保存空值，不阻断收藏。
- `fill_long_sentence_favorite`：只补空项，不覆盖已有译文/解析；解析 JSON 必须是对象。
- `list_due_word_favorites`：取 `due_date <= today` 的卡，并额外包含“当天最后一条事件为忘记”的卡。因此同一天重开窗口能继续本轮，最终记得后当日不再出现；今日总数按卡去重。
- `record_review_event`：`Immediate` 事务内先查 `reveal_id`，重复提交直接返回原评分与当前排程且 `recorded=false`；新事件写入后统一计算评分结果并更新排程，两者同一事务提交。
- 排程：`initial_due_date = today + 1`；连续记得阶段推进，间隔为 2、4、7、15、30 天，之后保持 30 天；忘记立即重置阶段 0、次日再测；当天已有忘记记录时，最终记得也按次日再测并重置。漏复习以实际完成日计算下一次，不按原到期日补算。日期计算使用公历天数，覆盖跨月、跨年、闰日。
- 新增 9 个 Tauri 命令：`list_word_favorites`、`add_word_favorite`、`remove_word_favorite`、`list_long_sentence_favorites`、`add_long_sentence_favorite`、`fill_long_sentence_favorite`、`remove_long_sentence_favorite`、`list_due_word_favorites`、`record_review_event`。

### 1.3 前端数据契约

`src/data/types.ts`、`tauriApi.ts`、`mock.ts` 同步新增收藏、排程、复习事件类型与 9 个 API；浏览器 mock 与 Rust 保持相同语义：相同去重键、次日首测、当天最后忘记可再出现、最终记得后当日不再计入、删除级联、重复揭晓只记一次。mock 也会为旧 localStorage 补建空集合与自增 ID。

## 2. 收藏

### 2.1 `src/collection/`

| 文件 | 职责 |
|---|---|
| `normalize.ts` | 规范化键（大小写不敏感、空白合并、保留标点/词序） |
| `sentence.ts` | 完整单句、句子数、整段/多句确认判定、短语候选判定 |
| `analysis.ts` | 解析结果打包为快照 JSON；容错读取旧快照；空内容判定 |
| `types.ts` | 收藏入口与结果类型；`wholeParagraph` 标记显式整段收藏 |
| `CollectionPage.tsx` | 生词本/长难句本两页签、来源回看、补全、逐条移除 |

生词本展示词形、规范化词形、原句快照、规范化原句、来源文章与段落、语境义、常见义、词形；长难句本展示原选区快照、译文、解析、来源文章与段落范围。缺失译文/解析显示“待补全”，可联网调用现有语言服务补全；补全结果通过 `fillLongSentenceFavorite` 写回快照。两个列表进入页面和窗口重新获得焦点时刷新。移除均有确认，词卡删除通过数据库级联同步移出排程与活动队列。

### 2.2 精读侧栏入口

`Inspector.tsx` 增加收藏动作：

- 词卡：“收藏词语”，快照包含词形、原句、语境义、常见义、音标、词性、词形。
- 译文：短语判定通过时“收藏短语”写入生词本，否则“收藏长难句”。
- 全文翻译逐段结果：“收藏本段”，整段收藏也走确认。
- 解析结果：“收藏长难句”，保存原文和解析，译文可空。

完整单句直接收藏；多句、跨段、无句末标点，或显式“本段翻译/收藏本段”先弹“是否加入长难句复习？”；取消不新增，确认将整个选区保存为一条。同一处再次收藏由 `source_key` 复用原记录，不重复新增，也不覆盖已有快照。文章后续编辑不触碰收藏表，原句、标题和段落范围保持收藏时状态。

## 3. 复习

### 3.1 词语窗口

`src/review/ReviewPage.tsx` 的 `WordReviewWindow`：

- 按本机日历日加载全部到期及逾期词卡，显示今日卡数、待复习数、本轮已记得数。
- 揭晓前只显示词、原句、来源与历史忘记次数；揭晓后显示语境义、常见义、词形与“记得/忘了”。
- “记得”移出本轮；“忘了”排到队尾，最后一张忘记后仍能再次揭晓。本轮队列在组件内维护，今日总数按卡去重。
- 窗口重新获得焦点时刷新；被删除的收藏会同时移出待复习队列，并让“今日 N 张”同步减少（本轮已记得、仍在生词本中的卡继续计入今日总数）。
- AI 重点词：把到期词、到期日、历史忘记次数和语境义发送给现有 OpenAI 兼容 `model_chat`；只接受列表内词汇，去重并截断为 5 条。请求失败时显示到期总数与历史累计忘记次数，并保留揭晓/评分能力。

### 3.2 长难句窗口

独立页签，读取全部长难句，先显示原文，揭晓后显示译文与结构化解析；缺失项显示待补全提示。支持上一条/下一条与来源回看。没有评分按钮、不写排程事件、不分组、不参与日期排程。切换页签会重新加载。

### 3.3 排程确定性与测试

`src/review/schedule.ts` 是浏览器 mock 与单元测试使用的镜像实现；桌面端以 Rust 为准。双方使用同一规则：

- 收藏次日首测；
- 连续记得 2/4/7/15/30 天，之后每 30 天；
- 忘记者阶段归零、次日再测；
- 本轮忘记后最终记得，次日再测并重置；
- 漏复习从实际完成日算下一次；
- 日期计算不依赖系统时区，跨月/跨年/闰日测试通过。

`src/review/coach.ts` 复用阶段 3 的模型配置、传输层和 `extractChatContent`，不扩展 `LanguageService`，避免影响既有测试桩。

## 4. 测试与验证

### 4.1 自动化结果

| 命令 | 结果 |
|---|---|
| `npm test` | **110 通过、3 跳过**（20 个测试文件通过、2 个文件跳过） |
| `cargo test` | **29 通过、1 忽略**（1 个忽略项为真实 Magpie 联调，沿用阶段 3） |
| `npm run build` | `tsc --noEmit` + Vite 生产构建通过 |
| 全量重复运行 | 最终改动后连续 10 次 `npx vitest run` 全部 110 通过，用于确认并行负载下不再出现工具条等待抖动 |

跳过的 3 项为既有可选测试：2 个真实 PDF 样卷回归（缺少测试样卷文件时跳过）与 1 个真实模型联调（`YUEJIAN_REAL_MODEL=1` 才执行）。

### 4.2 新增测试覆盖

前端新增 34 项（另有阶段 3 补强的单表命中用例 1 项，合计 35）：

- `src/review/schedule.test.ts`（6）：次日、2/4/7/15/30 链、漏一天、同轮忘记后答对、跨月/跨年/闰日、本地日历日与非法日期。
- `src/collection/normalize.test.ts`（5）：大小写与空白规范化、标点/词序保留、单句/多句/整段/短语判定。
- `src/collection/collectionApi.test.ts`（5）：同词同句去重、换句新增、文章编辑不覆盖快照、删除级联、长难句同处复用/补全/换处新增。
- `src/review/reviewApi.test.ts`（5）：到期/逾期、忘记后同日可再出现、最终记得后当日移除、重复揭晓只记一次、持久化、删除移出队列。
- `src/review/coach.test.ts`（4）：提示词只带到期词与历史摘要、过滤编造词与重复、损坏 JSON、经传输层解析。
- `src/review/ReviewPage.test.tsx`（5）：词语窗口忘记/揭晓/记得与重开持久化；删除收藏后今日数量与队列同步减少；长难句窗口原文先/揭晓后与持久化；AI 失败降级；长难句不排程及删除刷新。
- `src/collection/CollectionPage.test.tsx`（1）：来源回看、规范化字段、补全缺失解析、逐条移除。
- `src/collection/CollectFlow.test.tsx`（3）：词卡收藏与换句新增、短语入生词本、完整单句免确认、多句/整段取消与确认、同处复用、整段翻译入口确认。

Rust 新增 12 项：

- `review.rs`（7）：排程与日期边界。
- `db.rs`（5）：去重与换句新增、文章编辑后快照保留、复习流与同日忘记/最终记得、重复揭晓、删除级联、长难句复用与补全。

### 4.3 测试稳定性修复

并行跑全量时，`ReadingAssistant.test.tsx` 与 `CollectFlow.test.tsx` 偶发在首次划选时等待不到工具条；单独运行稳定。根因是测试在 React 初始提交尚未完全稳定时设置 Range，随后一次提交可能使 Range 指向旧文本节点，`captureSelection` 读不到选区。处理：

- `src/testSetup.ts` 将 `asyncUtilTimeout` 调到 3 秒，只放宽等待上限，不放宽断言。
- 两个测试文件的选区辅助函数先清掉旧工具条，并在首次选区未出现工具条时，用当前 DOM 节点重试一次。

产品选区逻辑未因此改变；`src/reader/SelectionToolbar.tsx` 最终保持阶段 3 原样。

### 4.4 阶段 3 两个小尾巴

- `src/language/vocabulary.test.ts` 补单表命中用例：`exactly` 仅四级、`environmental` 仅六级、`labor` 仅考研，其他表单表查询为空。
- 三套词表头注释补齐筛选口径：“统一小写、仅纯英文 `^[a-z]+$`、排除 `frq=0`、按 `(frq, bnc, word)` 取前 1600”。

## 5. 文件清单

### 新增

- `src-tauri/migrations/0004_collection_review.sql`
- `src-tauri/src/review.rs`
- `src/collection/normalize.ts`、`sentence.ts`、`analysis.ts`、`types.ts`、`CollectionPage.tsx`
- `src/collection/normalize.test.ts`、`collectionApi.test.ts`、`CollectionPage.test.tsx`、`CollectFlow.test.tsx`
- `src/review/schedule.ts`、`ReviewPage.tsx`、`coach.ts`
- `src/review/schedule.test.ts`、`reviewApi.test.ts`、`ReviewPage.test.tsx`、`coach.test.ts`
- `src/components/AnalysisSections.tsx`（从 Inspector 抽出的共用解析渲染）
- `work/CHANGES-T004.md`

### 修改

- `src-tauri/src/db.rs`、`src-tauri/src/lib.rs`
- `src/App.tsx`
- `src/data/types.ts`、`src/data/tauriApi.ts`、`src/data/mock.ts`
- `src/reader/Inspector.tsx`
- `src/styles.css`
- `src/language/vocabulary.test.ts`
- `src/language/wordlists/cet4.ts`、`cet6.ts`、`postgraduate.ts`（仅注释口径）
- `src/reader/ReadingAssistant.test.tsx`、`src/testSetup.ts`（仅测试稳定性）

## 6. 未完成 / 待人工验证

- 真实 Tauri 窗口中的鼠标拖选、两个复习窗口、SQLite 重启持久化与真实日期跨日未在本轮实机操作；自动化覆盖了对应数据语义和 mock 持久化，Rust 事务/迁移由 `cargo test` 覆盖。
- 真实 Magpie/DeepSeek 的“AI 重点词”请求未实测；传输层与失败降级由测试桩覆盖，联网联调留待阶段 5 交付前。
- Windows 安装包按范围约束未构建。