# R7 外部审查修复复核

日期：2026-11-22
复核方式：只读代码审查 + 测试复验 + 临时复现探针（已删除，未改动产品代码）

## 总体结论

9 项修复中 **8 项通过，1 项不通过**。

- 不通过：**P1-2 历史版本只读**。其主行为（预览只读、显式恢复、仅修改才保存）已实现，但 `showRevision` 只改 `documentId` 不改正文，导致「编辑 A 时预览 B 的历史版本 → 切页返回」后，A 的草稿被标注成 B，下一次编辑会写入 B。这是 P1-1 同类错位的残留路径，属本次修复引入的回归。
- 其余 8 项行为与测试均成立；阶段 3 划词、R5/R6 功能未见回归。
- 复验结果：`npm test` 29 个文件通过、2 个跳过，153 项通过、3 项跳过；`cargo test` 39 项通过、1 项忽略；`npx tsc --noEmit` 通过。

| 项 | 结论 | 关键证据 |
| --- | --- | --- |
| P1-1 作文 ID+草稿同态恢复 | 通过 | `EssayPage.tsx:141-192`、`EssayPage.test.tsx:168` |
| P1-2 历史版本只读 | **不通过（引入跨文档错位）** | `EssayPage.tsx:376-383`、临时探针 |
| P2-1 清空数据重置作文会话 | 通过 | `App.tsx:801-808`、`EssayPage.tsx:187-191`、`EssayPage.test.tsx:260` |
| P2-2 评分前重读日期 | 通过 | `ReviewPage.tsx:169-186`、`ReviewPage.test.tsx:212` |
| P2-3 状态统一派生+合并保序 | 通过 | `ReviewPage.tsx:117-129, 220-238`、`ReviewPage.test.tsx:245,262` |
| P2-4 全文翻译限并发+切文停派 | 通过 | `useReadingAssistant.ts:298-334`、`ReadingAssistant.test.tsx:529,551` |
| API Key 存储加固 | 通过（最小加固范围） | `config.ts:80-145`、`credentials.rs`、`config.test.ts:68,90` |
| 精简 1 统一打开文章流程 | 通过 | `App.tsx:333-376,668,749,766,776`、`App.test.tsx:258` |
| 精简 2 作文摘要按需读取 | 通过（有一处测试缺口） | `essay_history.rs:143`、`EssayPage.tsx:154-174,350-374`、`EssayPage.test.tsx:233` |

## 逐项核验

### 1. P1-1 作文恢复错位：通过

- `EssaySession` 现包含 `documentId/text/result/dirty/pendingId`（`src/essay/types.ts`）；App 初始化和清空均给全字段。
- 修复关键点不只是挂载时读会话 ID，还包括给选择持久化加了 `selectionReady` 门（`EssayPage.tsx:141-152`）。旧代码挂载首渲染会先把 localStorage 里的选择清空，异步列表随后读不到存储值，只能默认第一篇，这正是「选中 A + 正文 B」的根因；新代码在列表加载完成前不写存储。
- 挂载恢复（`EssayPage.tsx:154-192`）：会话有 `documentId` 且正文非空时只保留该 ID，不再默认第一篇；正文失焦保存使用 `session.documentId`（`EssayPage.tsx:271-283`）。
- 测试 `EssayPage.test.tsx:168` 真实走 App：打开 B、修改、切到精读再回作文，断言正文仍为 B 草稿、显示「修改区 2」、localStorage 为 B、`updateEssayText` 只指向 B、A 未变。该测试在旧实现下会失败（旧逻辑会默认 A 并把 B 草稿写入 A），有效锁定行为。

残余（非阻塞）：若会话正文被清空且已有 `documentId`，返回页面会重读数据库正文，空草稿被丢弃。空正文本来也不允许保存，属既有约束。

### 2. P1-2 历史版本只读：不通过（引入新的跨文档错位）

主行为本身成立：

- 点击历史记录只设置 `previewRevision`（`EssayPage.tsx:376-383`），编辑框 `readOnly={previewRevision !== null}`（`EssayPage.tsx:524-541`），`saveText` 在预览态直接返回（`EssayPage.tsx:273-281`）。
- 「恢复此版本」是唯一把快照放回编辑区的操作（`EssayPage.tsx:385-397`），恢复后 `dirty` 为 false；测试 `EssayPage.test.tsx:195` 断言预览失焦不写库、恢复后直接失焦不写库、继续编辑才写一次，测试真实有效。

但 `showRevision` 的这行破坏了「ID、正文、脏标记同属一个会话」的不变量：

```tsx
// EssayPage.tsx:382
onSessionChange((current) => ({ ...current, documentId: document.id, pendingId: null }));
```

它把 `documentId` 换成被预览版本所属的作文，却保留当前编辑框的 `text` 和 `dirty`。挂载恢复又恰好信任这个组合（`EssayPage.tsx:168`：有 ID、有正文就原样保留），于是错位被固化。

复现（临时 vitest 探针，运行通过后已删除）：

1. 准备作文 A、B，B 有一条批改记录。
2. 选中 A，输入 ` A draft.`；展开 B 的批改记录（点击时失焦先把 A 草稿保存）。
3. 点击 B 的「第 1 次批改」进入只读预览；切到「精读」再回「作文批改」。
4. 返回后正文显示 `Essay A original. A draft.`，顶部却显示「修改区 2」（B）。
5. 再输入一个字符并失焦，`updateEssayText` 收到 `(B.id, "Essay A original. A draft. X.")`。

也就是说，任意「编辑 A → 预览另一篇 B 的历史 → 切页」都会把 A 的草稿带到 B 名下；返回后只要继续编辑，就会覆盖 B。测试只覆盖了「预览当前作文自己的历史」，因此没锁住这条路径。

建议：预览态不得改动作业会话的 `documentId/text/dirty`，预览所属作文单独派生（如 `previewRevision.documentId` 对应的名称用于顶部标签）；「恢复此版本」再一次性写入 ID+正文+干净标记。补一条跨文档预览后切页返回的测试。

### 3. P2-1 清空数据重置作文会话：通过

- App 清空成功回调重置 `essaySession` 全字段并移除选择键（`App.tsx:801-808`）。
- 作文页卸载清理递增请求序号并使本地 `pendingId` 失效（`EssayPage.tsx:187-191`）；批改流程在 AI 返回、建作文、写批改、重读详情后都核对 `pendingId` 与正文。
- 测试 `EssayPage.test.tsx:260` 完整覆盖「提交批改 → 设置页清空 → 旧响应返回」，断言数据库为空、重进作文页为空会话、localStorage 选择键为空。

残余（低概率）：若批改续体在页面卸载前刚好通过 `pendingId` 校验并已发出 `createEssayDocument`，而该命令在清空命令之后才落库，理论上可出现一篇孤儿作文；后续写批改仍会被 `pendingId` 拦住。当前清空必须先进设置页（先卸载作文页），实际窗口极小，未作为不通过项。

### 4. P2-2 评分前重读日期：通过

- `rate()` 每次提交前调用 `getToday()`；与 `activeDateRef` 不一致时更新日期并直接返回，不写评分（`ReviewPage.tsx:169-186`）。
- `today` 变化触发重置队列、揭晓态、轮次 ID 并重载（`ReviewPage.tsx:83-97`）；旧日期的在途刷新靠 `activeDateRef` 丢弃（`ReviewPage.tsx:105`）。
- 测试 `ReviewPage.test.tsx:212` 用可变日期：昨晚揭晓、零点后点「记得」，断言未记录、显示新日 2 张且回到未揭晓；重新揭晓再评分后事件 `localDate` 为新日期。行为锁定真实。

### 5. P2-3 本轮状态统一与合并保序：通过

- `due` 状态已删除；待复习数、当前卡、AI 输入、历史忘记合计全部由 `queue` 派生（`ReviewPage.tsx:151, 220-238`）。
- 刷新合并：用新查询结果更新保留卡、按旧顺序保留、移除失效项、末尾追加新卡（`ReviewPage.tsx:117-129`），`[A] + [A,B] → [A,B]`。
- 测试 `ReviewPage.test.tsx:245` 锁刷新保序追加；`262` 锁忘记后队列 `[B,A]`、忘记次数立即为 1、AI 收到同一顺序和计数。均能区分旧实现（旧实现刷新会过滤成 `[A]`，AI 读 `due`）。

观察（非阻塞）：错误提示里的「历史累计忘记」现在只统计本轮剩余卡；已「记得」并被移出队列的卡所带的历史忘记数不再计入。若文案仍强调「历史累计」，语义略有收窄，建议改文案或单独累计。

### 6. P2-4 全文翻译限并发与切文停派：通过

- 改为 3 个工作者共享游标；每段完成后再取下一段（`useReadingAssistant.ts:298-334`）。
- 每次取段前用 `isCurrent(seq, target)` 核对请求序号和文章 ID/版本（`useReadingAssistant.ts:140-148`）；切文或发起新操作后不再派发，未完成请求虽自然返回，但结果校验失败不会显示（`useReadingAssistant.ts:335`）。
- 测试 `ReadingAssistant.test.tsx:529` 断言 7 段文章点击后只发 3 段、完成第 1 段才补第 4 段；`551` 断言 6 段文章切文后请求数停在 3、旧译文不显示。均直接锁定目标。

### 7. API Key 存储加固：通过（限定在「最小加固」范围）

- `saveStoredModelService` 只写非敏感字段，`apiKey` 被剥离（`config.ts:80-89`）；桌面端保存/读取走 Tauri 命令，文件为应用数据目录下 `model-api-key`（`config.ts:92-96,109-145`；`lib.rs:133-148`；`credentials.rs`）。
- Unix 使用 `0600` 并再次 `set_permissions`；读取修剪空白；空值删除文件。Rust 测试覆盖写入、覆盖、权限、清空（`credentials.rs:60`）。
- 旧明文 Key 的桌面迁移会先写文件再从 localStorage 剥离（`config.ts:109-121`），前端测试 `config.test.ts:68,90` 覆盖「持久化不含明文」和「迁移后移除明文」。
- 如实说明：磁盘文件仍是明文，Windows 未额外设置 ACL（依赖应用数据目录的继承权限），完整系统凭据存储仍属阶段 5；浏览器预览下历史遗留的 localStorage 明文 Key 要等到下次保存才会被剥离（桌面迁移与保存路径均已移除）。交付说明已披露这些边界，符合本轮「最小加固」授权。

### 8. 精简 1 统一打开文章流程：通过

- 分区列表、资料库、收藏、复习回看全部改走同一个 `openArticle`（`App.tsx:668,749,766,776`）；旧的 `selectArticle` / `openArticleFromLibrary` 已不存在。
- 每次点击递增 `openArticleRequestRef`；保存编辑器后、读取文章后、错误提示前都核对序号（`App.tsx:333-376`），只有最后一次点击能落地。
- 测试 `App.test.tsx:258` 让 B 先点后返回、C 后点先返回，断言最终保持 C 且迟到响应不覆盖。有效。

行为变化（可接受）：从资料库/收藏/复习打开文章也会写入 `LAST_KEY`；旧资料库路径不写。属于统一后的合理补全。

### 9. 精简 2 作文摘要与按需历史：通过

- Rust 新增 `list_essay_summaries`（当前正文 + `COUNT` 批改数，不含历史载荷）和 `get_essay_document`（`essay_history.rs:143`、`lib.rs:349-357`），并注册命令。
- 前端启动只调 `listEssaySummaries`；选中/首次展开/批改完成才 `getEssayDocument`（`EssayPage.tsx:126-139,154-174,350-374`）；新建、重命名、保存正文、增删批改、删作文都用 `storeDocument` 局部更新（`EssayPage.tsx:95-108`），不再整表重载。
- 前端测试 `EssayPage.test.tsx:233` 断言摘要只查一次、`listEssayDocuments` 未调用、展开第二篇才读第二篇历史；Rust 测试 `essay_history.rs:372` 断言摘要序列化不含 `revisions`/历史润色文本、详情按需可读。

测试缺口（非行为缺陷）：重命名后的断言只检查摘要仍只查一次，没有再次断言 `listEssayDocuments` 未调用；若将来把重命名改回整表重载，该测试不会失败。建议在重命名/新建/删除后都补 `expect(documents).not.toHaveBeenCalled()`。实现本身是局部更新，已人工核对。

## 回归检查

- 前端 29 个测试文件、153 项通过；包含阶段 3 选区/划词、阅读助手、复习、作文历史、设置、App 导航等既有用例，未见回归。
- Rust 39 项通过、1 项既有忽略；TypeScript `tsc --noEmit` 通过。
- 本次唯一确认的回归为 P1-2 的跨文档预览错位（见上），不在现有测试覆盖内。

## 收口建议

1. **必须修**：`showRevision` 不得改变编辑会话的 `documentId`（或必须同时挂起/恢复正文与脏标记）；补跨文档「预览 B → 切页 → 返回」测试。
2. 建议补：作文局部更新的测试在新建/重命名/删除后再次断言未调用 `listEssayDocuments`。
3. 可选：复习错误提示的「历史累计忘记」文案与 queue 派生口径对齐；阶段 5 前保持 API Key 文件权限与迁移路径的实机验证。
## R7.1 修复记录

- 修复 P1-2 跨文档预览错位：`showRevision` 不再改动会话的 `documentId/text/dirty`；预览时顶部修改区序号与名称改由 `previewRevision.documentId` 派生。「恢复此版本」仍一次性写入版本所属 ID、正文、结果及 `dirty:false`。
- 新增跨文档回归测试：编辑 A 后预览 B 的历史，切页返回仍显示 A 的草稿和名称，后续保存只写入 A，B 正文不变。
- 补齐精简 2 测试缺口：新建、重命名、删除作文后分别断言未调用 `listEssayDocuments`，摘要仍只查询一次。
- 验证：`npm test` 通过（29 个文件通过、2 个跳过；155 项通过、3 项跳过）；`npm run build` 通过。
