# T-004 阶段 4 收藏与复习独立审查

审查日期：2026-11-21。依据 `work/CHANGES-T004.md`、`PRD.md` F5/F6 与 `项目方案.md` 的收藏、复习、持久化一致性要求，只读检查当前实现与测试；未修改产品代码。

## 结论

数据库四张表、规范化去重、旧快照保留、评分事务和 2/4/7/15/30 排程均与方案一致，固定日期测试有效。前端收藏主流程、单卡忘记后再揭晓、长难句按需复习和 AI 失败降级也已有实现。

但当前不宜直接判定阶段 4 完整通过：**来源回看没有跳到原文位置；复习组件保持挂载跨日时，今日数量和待复习队列不会按新日期重建。** 两项分别影响 F5.5、F6.1/F6.7。另有 2 项非阻断建议。

## 严重

### 1. 来源回看只打开文章，没有跳到收藏的原文位置

- F5.5 明确要求“从收藏跳回原文位置”（`PRD.md:74`）。收藏记录已经保存 `paragraphStart/paragraphEnd`，但两个页面的回调类型都只有 `articleId`（`src/collection/CollectionPage.tsx:25-30`、`src/review/ReviewPage.tsx:28-34`），点击时也只传文章 ID（`src/collection/CollectionPage.tsx:256-265`、`src/collection/CollectionPage.tsx:343-352`、`src/review/ReviewPage.tsx:470-478`）。
- App 的 `openArticleFromLibrary` 同样只接收文章 ID，加载后仅切换文章和分区，没有接收或消费段落范围（`src/App.tsx:326-354`）；收藏与复习页都复用这一入口（`src/App.tsx:717-730`）。正文虽有 `p[data-i]` 可作为定位目标（`src/reader/ReaderView.tsx:200-215`），当前调用链没有滚动或选中逻辑。
- 现有测试只断言回看后出现文章标题（`src/collection/CollectionPage.test.tsx:90-94`），因此“打开文章”被误当成了“回到原文位置”通过，未检查目标段落。
- 影响：长文或跨段收藏无法直接回到对应段落，F5.5 只完成了一半。建议把段落范围传入打开文章的调用链，在正文提交后滚动到起始段；来源已编辑导致原位置不存在时，应明确回退到文章开头并保留快照查看能力。

### 2. 复习页保持挂载跨日时，今日总数和队列沿用旧日期状态

- `today` 只是 render 时计算的字符串（`src/review/ReviewPage.tsx:52`），而 `seenRef`、`roundRef`、`rememberedCount` 都是跨 render 保留的本轮状态（`src/review/ReviewPage.tsx:59-70`），没有日期变化时的重置分支。
- 刷新时，已有挂载只会向 `seenRef` 继续添加卡 ID，不会在新日期清空昨天的 ID（`src/review/ReviewPage.tsx:79-88`）；队列更新也只过滤旧队列，若旧队列非空，不会把新到期但不在旧队列中的卡加入（`src/review/ReviewPage.tsx:90-96`）。`rememberedCount` 同样没有跨日归零。
- 因此，昨天完成复习后不关闭应用，今天刷新会把昨天已见过的卡继续计入“今日 N 张”；若昨天仍有未完成队列，今天新到期的卡可能只进入 `due`，却不进入实际待复习 `queue`。这同时破坏 F6.1 的按本机日统计和 F6.7 的跨日队列恢复。
- 当前测试把 `TODAY` 固定为模块加载日本地日期（`src/review/ReviewPage.test.tsx:8`），只覆盖同日卸载后重开（`src/review/ReviewPage.test.tsx:77-89`），没有 fake clock 推进已挂载组件跨日的场景；交付说明也明确真实日期跨日未实测（`work/CHANGES-T004.md:163-166`）。
- 建议以日期 key 显式划分轮次：日期变化时重建 queue/seen/total/rememberedCount/round/reveal 状态，再从新日期的到期集合加载，并补“昨天已完成”和“昨天未完成”两种跨日组件测试。

## 建议

### 1. `fill_long_sentence_favorite` 实际会覆盖已有内容，与交付说明“只补空项”不符

- 交付说明写的是“只补空项，不覆盖已有译文/解析”（`work/CHANGES-T004.md:30`）。Rust 却优先采用本次传入的非空 `translation/analysis`，只在缺省时回退旧值（`src-tauri/src/db.rs:1380-1398`）；浏览器 mock 同样优先使用新值（`src/data/mock.ts:746-756`）。所以对已有译文再次调用补全命令并传入另一译文，会覆盖旧快照。
- 当前 UI 只在缺项时显示补全按钮（`src/collection/CollectionPage.tsx:307-340`），正常界面路径不会触发覆盖，因此列为建议而非严重问题。但命令层行为与说明不一致，后续调用方容易误用。
- 现有测试只验证空项补全和已有字段在“另一字段补全”时保留（`src/collection/collectionApi.test.ts:154-164`、`src-tauri/src/db.rs:2203-2216`），没有直接传入新的非空同名字段来锁定“不覆盖”。建议统一实现与交付契约，或明确把接口改名为允许更新并调整快照规则。

### 2. 长难句刷新替换当前条目时，没有重置已揭晓状态

- 手动上一条/下一条会执行 `setRevealed(false)`（`src/review/ReviewPage.tsx:381-386`），但 focus/手动刷新只替换 `items` 和收敛索引，不重置 `revealed`（`src/review/ReviewPage.tsx:353-365`）。
- 若当前第一条已揭晓，随后该收藏被外部删除并触发 focus 刷新，同一索引会变为下一条，而 `revealed` 仍为 true，下一条会直接展示译文与解析，绕过“先原文后揭晓”（渲染分支见 `src/review/ReviewPage.tsx:420-452`）。词语窗口已按 `currentId` 重置揭晓状态（`src/review/ReviewPage.tsx:111-118`），长难句窗口缺少对应保护。
- 删除刷新测试未先揭晓，也没有断言删除后新当前条的答案仍隐藏（`src/review/ReviewPage.test.tsx:202-238`）。建议按当前收藏 ID 重置揭晓状态，并补该路径。

## F5 逐条对照

### F5.1 生词本字段与单词/短语收藏 —— 实现完整，测试有效

- 数据表包含展示词形、两个规范化字段、原句快照、来源文章/标题/段落、语境义、常见义及附加词形信息（`src-tauri/migrations/0004_collection_review.sql:4-20`）。
- 词卡入口传递上述快照（`src/reader/Inspector.tsx:103-119`）；短语翻译入口保存短语及其所在原句（`src/reader/Inspector.tsx:207-225`）。收藏页实际展示必需字段（`src/collection/CollectionPage.tsx:223-255`）。
- 组件测试覆盖词卡、换句和短语收藏（`src/collection/CollectFlow.test.tsx:143-185`），页面测试覆盖规范化字段、来源和释义展示（`src/collection/CollectionPage.test.tsx:77-88`）。

### F5.2 规范化组合键去重，同词换句另存 —— 确认可行

- 唯一索引正是 `(normalized_word, normalized_sentence)`（`src-tauri/migrations/0004_collection_review.sql:22-24`）。前后端均合并空白并转小写，不去标点、不改词序（`src/collection/normalize.ts:1-7`、`src-tauri/src/db.rs:1023-1030`）。
- Rust 用例同时验证大小写/换行空白去重、旧释义不覆盖和换句新增（`src-tauri/src/db.rs:2003-2049`）；前端镜像有同场景测试（`src/collection/collectionApi.test.ts:48-79`），规范化函数另有独立测试（`src/collection/normalize.test.ts:10-25`）。

### F5.3 长难句确认、快照、缺项保存与补全 —— 主流程可行，补全契约见建议 1

- 完整单句判定与多句/跨段确认集中在 `shouldConfirmLongSentence`（`src/collection/sentence.ts:8-33`），显式整段入口也会强制确认，取消直接返回且不写库（`src/App.tsx:489-510`）。
- 原文、译文、解析和来源范围均持久化（`src-tauri/migrations/0004_collection_review.sql:28-44`）；空译文/解析允许保存，收藏页可补全（`src/collection/CollectionPage.tsx:113-153`、`src/collection/CollectionPage.tsx:307-340`）。
- 组件测试覆盖单句免确认、多句取消/确认、整段确认及同处复用（`src/collection/CollectFlow.test.tsx:187-253`）；数据测试覆盖缺项保存与补全（`src/collection/collectionApi.test.ts:130-175`）。

### F5.4 来源编辑不覆盖收藏快照 —— 实现可行，长难句直接回归不足

- 收藏保存独立原文和标题字段，文章外键只用于来源关联（`src-tauri/migrations/0004_collection_review.sql:4-19`、`src-tauri/migrations/0004_collection_review.sql:28-39`）；重复词语收藏命中后直接返回旧记录，没有 UPDATE 快照的路径（`src-tauri/src/db.rs:1202-1221`）。
- Rust 与 mock 都直接测试了词语原句和标题在文章编辑后保持不变（`src-tauri/src/db.rs:2051-2099`、`src/collection/collectionApi.test.ts:81-106`）。
- 未找到“长难句收藏后编辑文章”的同等级直接测试；实现结构支持隔离，但建议补一条，避免以后共用更新逻辑时回归。

### F5.5 来源回看、逐条移除、删除同步队列 —— 删除闭环可行，来源定位不完整（严重 1）

- 删除词语会级联删除排程和事件（`src-tauri/migrations/0004_collection_review.sql:48-67`），收藏页删除后刷新，复习页 focus 刷新会过滤已删除卡并减少今日总数（`src/collection/CollectionPage.tsx:91-110`、`src/review/ReviewPage.tsx:72-96`）。
- Rust 级联、mock 队列和 React 删除刷新都有测试（`src-tauri/src/db.rs:2145-2175`、`src/collection/CollectionPage.test.tsx:108-118`、`src/review/ReviewPage.test.tsx:91-116`）。
- 回看仅打开文章，不满足“原文位置”，详见严重 1。

### F5.6 翻译与解析结果均有收藏入口 —— 确认可行

- 选区/段落翻译有收藏入口（`src/reader/Inspector.tsx:258-271`），全文逐段结果有“收藏本段”（`src/reader/Inspector.tsx:172-185`），独立解析结果也有入口且允许译文为空（`src/reader/Inspector.tsx:296-309`）。
- `CollectFlow` 覆盖翻译、解析和整段入口（`src/collection/CollectFlow.test.tsx:187-253`）。

## F6 逐条对照

### F6.1 本机日到期+逾期、今日按卡去重 —— 数据查询可行，挂载跨日不完整（严重 2）

- SQL 取 `due_date <= today`，并额外保留当天最后事件为“忘记”的卡；每卡只有一条排程主键，查询不会重复返回同卡（`src-tauri/src/db.rs:1148-1178`、`src-tauri/migrations/0004_collection_review.sql:48-54`）。UI 还用 `Set<number>` 统计今日卡数（`src/review/ReviewPage.tsx:67-95`）。
- 到期、逾期、次日首测和忘记不增量有数据测试（`src/review/reviewApi.test.ts:42-79`）。跨日不重置见严重 2。

### F6.2 本轮记得移出、忘了队尾、最后一张可再揭晓、忘记后记得重置 —— 实现可行，多卡顺序缺直接测试

- 揭晓生成递增 `revealId`；记得移除队首，忘了把队首移到末尾，单卡忘记则保留并回到未揭晓状态（`src/review/ReviewPage.tsx:120-165`）。
- Rust 查询当天忘记记录，最终记得也走阶段 0、次日到期（`src-tauri/src/db.rs:1474-1497`、`src-tauri/src/review.rs:113-126`）。
- 组件测试直接覆盖最后一张忘记后再次揭晓、最终记得及同日重开（`src/review/ReviewPage.test.tsx:40-89`），Rust 覆盖排程结果（`src-tauri/src/db.rs:2101-2143`）。当前组件用例只有一张卡，未用两张以上卡断言“忘了”后的实际队尾顺序；代码逻辑正确，建议补直接顺序断言。

### F6.3 确定性排程与实际完成日 —— 确认可行，固定日期覆盖充分

- Rust 规则为初次次日、连续记得 2/4/7/15/30 后保持 30，忘记或当天曾忘记均重置到次日；所有间隔从传入的实际 `today` 计算（`src-tauri/src/review.rs:96-126`）。
- 固定日期测试覆盖次日、完整间隔链、逾期完成、同轮忘记后答对、跨月/跨年/闰日及非法日期（`src-tauri/src/review.rs:128-200`）；前端镜像也有等价固定日期测试（`src/review/schedule.test.ts:10-99`）。这些断言不依赖运行当天。

### F6.4 评分与排程同事务、揭晓防重 —— 确认可行

- `review_events.reveal_id` 有数据库唯一约束，排程与事件均对词卡外键级联（`src-tauri/migrations/0004_collection_review.sql:48-71`）。
- `record_review_event` 在 `Immediate` 事务内查重、插事件、算排程并更新，重复揭晓直接返回且不二次推进（`src-tauri/src/db.rs:1424-1505`）。
- Rust 和 mock 均验证重复揭晓只记一次（`src-tauri/src/db.rs:2138-2142`、`src/review/reviewApi.test.ts:81-90`）。

### F6.5 长难句独立按需复习 —— 主流程可行，刷新揭晓状态见建议 2

- 窗口读取全部长难句，先原文、后译文和结构化解析，支持上下条与来源入口，没有评分或排程写入（`src/review/ReviewPage.tsx:339-493`）。
- 测试覆盖未揭晓隐藏答案、揭晓后显示持久快照、无评分按钮及删除刷新（`src/review/ReviewPage.test.tsx:118-164`、`src/review/ReviewPage.test.tsx:202-238`）。

### F6.6 今日提醒、AI 重点词与断网降级 —— 实现与桩测试可行，真实模型仍待联调

- 复习页显示今日量、待复习量和提醒（`src/review/ReviewPage.tsx:194-218`）；AI 失败时显示到期量与历史忘记次数，评分区域不受影响（`src/review/ReviewPage.tsx:246-251`、`src/review/ReviewPage.tsx:254-312`）。
- 提示词只构造到期词、到期日、历史忘记次数和语境义，要求给理由（`src/review/coach.ts:16-39`）；响应只接受列表内词、去重并截断 5 条（`src/review/coach.ts:51-88`），传输复用现有模型配置（`src/review/coach.ts:90-105`）。
- 测试覆盖提示词、过滤编造/重复、损坏 JSON、传输解析和断网后继续揭晓（`src/review/coach.test.ts:33-111`、`src/review/ReviewPage.test.tsx:166-200`）。真实 Magpie/DeepSeek 未实测，交付说明已正确保留此待验项（`work/CHANGES-T004.md:165-166`）。

### F6.7 跨日/重启恢复 —— 同日重开与排程持久化可行，挂载跨日不合格（严重 2）

- SQLite 持久化收藏、排程和事件；当天最后忘记事件使同日重开继续本轮，最终记得后不再到期（`src-tauri/src/db.rs:1148-1178`）。mock 重开和 Rust 数据流均覆盖这些语义（`src/review/reviewApi.test.ts:92-101`、`src-tauri/src/db.rs:2101-2143`）。
- 已挂载组件跨日状态未重置，见严重 2。真实 Tauri SQLite 文件关闭后重开和真实跨日没有实机证据，不能把 mock 重开等同于桌面端完整验收（`work/CHANGES-T004.md:163-166`）。

## 数据层与事务专项确认

1. **四张表符合一致性表。** 词语组合唯一键、长难句 `source_key` 唯一、词卡排程主键、事件 `reveal_id` 唯一均存在；来源文章删除为 `SET NULL`，快照字段不随外键消失，词卡删除对排程和事件为 `CASCADE`（`src-tauri/migrations/0004_collection_review.sql:4-73`）。迁移和测试连接都开启外键（`src-tauri/src/db.rs:269-278`、`src-tauri/src/db.rs:310-322`、`src-tauri/src/db.rs:1634-1638`）。
2. **`add_word_favorite` 查重不覆盖旧快照。** 规范化后开启 `Immediate` 事务，在事务内按组合键查询；命中时读取并返回旧记录，未执行 UPDATE；未命中时收藏与阶段 0 排程在同一事务写入（`src-tauri/src/db.rs:1181-1257`）。测试传入不同新释义仍断言旧释义保留（`src-tauri/src/db.rs:2014-2034`）。
3. **排程确定性成立。** 日期由显式字符串输入，不在 Rust 排程函数读取系统时钟；公历换算与固定日期测试覆盖所要求边界（`src-tauri/src/review.rs:33-126`、`src-tauri/src/review.rs:132-200`）。
4. **今日查询的同日恢复逻辑成立。** 只有当天最新事件为忘记才额外保留未来到期卡，避免最终记得后同日又出现（`src-tauri/src/db.rs:1157-1171`），对应 Rust 测试同时覆盖忘记、最终记得和次日（`src-tauri/src/db.rs:2122-2136`）。

## 实际验证与边界

- 本次独立执行 `npm test`：**110 通过、3 跳过**（20 个文件通过、2 个跳过）。跳过项仍为 2 个真实 PDF 样卷回归和 1 个默认关闭的真实模型联调。
- 本次独立执行 `cargo test`：**29 通过、1 忽略**；忽略项为真实 Magpie 联调。
- 本次独立执行 `npx tsc --noEmit`：通过。未重复生成生产构建，未操作真实 Tauri 窗口、真实跨日或真实 AI 服务。
- 自动化全绿不消除上述两项严重问题：现有断言没有覆盖原文段落定位，也没有推进已挂载复习组件的本机日期。

## R2 修复记录

1. **来源回看定位原段。** 收藏页和复习页的回调现在传递 `paragraphStart/paragraphEnd`，App 打开文章时保存目标范围，ReaderView 在正文提交后滚动到对应 `p[data-i]`。来源段落已不存在时回退到文章开头，收藏快照保持不变。组件测试断言了实际滚动目标段，并覆盖段落删除后的回退与快照查看。
2. **复习轮次按日期重建。** 词语复习以日期 key 管理轮次，刷新时核对本机日期；跨日后重建 queue、seen、total、rememberedCount、round 和揭晓状态，再加载新日期到期集合，旧日期异步结果不会覆盖新轮次。通过注入日期补了“昨天已完成”和“昨天未完成”两种保持挂载的跨日组件测试。
3. **长难句补全只补空项。** Rust 与浏览器 mock 均优先保留已有非空译文和解析，只使用传入内容填补空项；两端测试均新增“传入新非空同名字段不覆盖”的断言，空项的非法解析仍会报错。
4. **替换长难句后重新隐藏答案。** 长难句复习按当前收藏 ID 重置 `revealed`，刷新或删除导致当前条目替换时不会直接展示下一条答案；删除当前已揭晓条目的组件测试已覆盖。

验证结果：`npm test` 113 通过、3 跳过；`cargo test` 29 通过、1 忽略；`npm run build` 通过。跳过和忽略项仍为原有真实样卷及真实模型联调。

## R2 反审记录

反审日期：2026-11-22。只读核对 R2 四项修复及当前代码/测试，未修改产品代码。独立执行 `npx vitest run`：113 通过、3 跳过；`cargo test`：29 通过、1 忽略；`npx tsc --noEmit` 与 `npm run build` 均通过。

1. **来源回看段落定位链路 —— 通过。** 收藏页与复习页的 `onOpenArticle` 均要求并传递 `paragraphStart/paragraphEnd`（`src/collection/CollectionPage.tsx:28-32`、`src/collection/CollectionPage.tsx:264-270`、`src/collection/CollectionPage.tsx:356-362`；`src/review/ReviewPage.tsx:34-38`、`src/review/ReviewPage.tsx:354-360`、`src/review/ReviewPage.tsx:522-528`）。App 在 `openArticleFromLibrary` 中先加载文章，再把 `{articleId, paragraphStart, paragraphEnd}` 存入 `paragraphTarget`（`src/App.tsx:332-368`），并透传给 ReaderView（`src/App.tsx:670-672`）。ReaderView 在正文提交后用 `p[data-i]` 精确定位并 `scrollIntoView({ block: "start" })`，目标不存在时 `scrollTop = 0`（`src/reader/ReaderView.tsx:87-101`，段落属性见 `src/reader/ReaderView.tsx:230-233`）。测试实际断言滚动目标是收藏段（`src/collection/CollectionPage.test.tsx:92-100`；`src/review/ReviewPage.test.tsx:261-265`），并覆盖段落删除后回开头且快照仍可查看（`src/collection/CollectionPage.test.tsx:127-168`）。未发现快照被文章更新回写。

2. **复习轮次日期 key 重建 —— 通过。** `today` 来自可注入的 `getToday`（`src/review/ReviewPage.tsx:63`），日期变化时统一清空 `queue/due/total/rememberedCount/revealed/revealId/focus`、重建 `seenRef` 与 `roundRef` 并重新进入加载态（`src/review/ReviewPage.tsx:84-99`）；刷新请求用 `activeDateRef` 丢弃旧日期的迟到结果（`src/review/ReviewPage.tsx:107`），焦点和刷新按钮都先比较本机日期（`src/review/ReviewPage.tsx:134-145`）。两项跨日测试均保持组件挂载，只改变注入日期再派发 `focus`，不是卸载重开：昨天已完成后今日只加载新到期卡且“本轮记得 0”（`src/review/ReviewPage.test.tsx:137-173`）；昨天未完成后今日重建为 2 张、旧答案重新隐藏（`src/review/ReviewPage.test.tsx:175-210`）。若未重置旧 `seenRef/rememberedCount`，这两处断言会失败，测试有效。

3. **`fill_long_sentence_favorite` 只补空项 —— 通过。** Rust 优先保留已有译文和解析，只有空值才采用本次输入（`src-tauri/src/db.rs:1384-1394`），测试传入新的非空同名字段并断言旧快照未变（`src-tauri/src/db.rs:2232-2250`）；浏览器 mock 同样保留已有非空字段（`src/data/mock.ts:746-757`），测试对应覆盖（`src/collection/collectionApi.test.ts:173-181`）。空项遇到非法解析仍报错；已有解析时输入不再参与写入，符合“只补空项”的契约。

4. **长难句替换按 ID 重置揭晓 —— 通过。** 揭晓状态由 `currentId` 的 effect 重置（`src/review/ReviewPage.tsx:419-423`），手动上一条/下一条仍显式重置（`src/review/ReviewPage.tsx:430-435`）。删除测试实际删除的是已揭晓的当前条（列表按创建时间/id 倒序，后加入的 `second` 在首位，见 `src/data/mock.ts:699-702`），刷新替换为第一条后断言揭晓按钮重新出现、第一条译文仍隐藏（`src/review/ReviewPage.test.tsx:304-343`）。

### 新问题核查

- 滚动在正文提交后的 effect 中执行，DOM 已就绪；常规打开文章路径会清空 `paragraphTarget`（`src/App.tsx:198`），不会串到其他文章。观察项：定位成功后 App 未清空该状态，对同一文章再次进入编辑并取消/保存时会重跑 effect 并跳回收藏段（`src/reader/ReaderView.tsx:87-101`、`src/App.tsx:309-314`）；属轻微行为副作用，不影响定位正确性。
- 跨日重置保护了 `refresh` 的迟到响应，但 `rate` 与 AI 焦点请求若产生于旧日期且跨日时仍在途，没有日期判别（`src/review/ReviewPage.tsx:170-201`、`src/review/ReviewPage.tsx:210-223`）；仅在“请求在途且恰好跨午夜并重新聚焦/刷新”的极窄窗口可能污染新日队列。非阻断，可作为后续加固项。
- 长难句的 `revealed` 由 effect 在绘制后重置，替换瞬间理论上有一帧保留旧揭晓态；实际交互不可感知，测试终态正确。

结论：四项 R2 修复均与修复记录一致，未见阻断性新问题。真实 Tauri 窗口、真实跨日与真实模型联调仍按原记录待人工验证。
