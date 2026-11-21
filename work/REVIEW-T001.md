# T-001 独立审查记录

审查日期：2026-11-21  
审查范围：`work/TASKS.md` 的 T-001 验收条件、`work/CHANGES-T001.md`、`src/`、`src-tauri/`。除指定的 11 处测试字段访问和本报告外，审查未修改实现代码。

结论：Rust 编译错误已修复，前后端测试与构建通过；数据层事务、原子版本校验和数据库分区去重实现可行。发现 2 个用户可见的必须修复问题；真实 Tauri 窗口与 SQLite 重启保留仍是验收阻断项，当前不能据此判定 T-001 全部验收通过。

## 【修复记录】

只把 `ArticleDetail` 的 `id` / `title` 直接访问改为经 `summary` 访问，共 11 处，未改测试断言内容、数据库逻辑或其他代码：

| 位置 | 修复内容 | 处数 |
|---|---|---:|
| `src-tauri/src/db.rs:816` | `detail.title` → `detail.summary.title` | 1 |
| `src-tauri/src/db.rs:838`、`:848`、`:855` | `created.id` → `created.summary.id` | 3 |
| `src-tauri/src/db.rs:849` | `reloaded.title` → `reloaded.summary.title` | 1 |
| `src-tauri/src/db.rs:871`（2 处）、`:874`、`:876`、`:878`、`:881` | `detail.id` → `detail.summary.id` | 6 |

修复后已确认文件中不再有 `detail.id`、`detail.title`、`created.id`、`created.title`、`reloaded.id`、`reloaded.title` 这些直接访问。

实际验证：

- `cd src-tauri && cargo test`：编译成功，10 个 Rust 测试全部通过，0 失败；E0609 已消除。
- `npm test -- --run`：2 个测试文件、8 个前端测试全部通过。
- `npm run build`：TypeScript 类型检查与 Vite 构建通过。

## 【审查意见】

### 严重问题（必须修）

1. **粘贴对话框的“主题”输入被静默丢弃，与交付说明不符。**  
   `src/components/ArticleDraftFields.tsx:36-48` 在粘贴和编辑表单中提供主题输入，但 `src/library/PasteDialog.tsx:52` 提交时只传 `title`、`text`；`src/data/types.ts:59` 和 `src-tauri/src/db.rs:61-64` 的粘贴输入类型也没有 `topic`，后端在 `src-tauri/src/db.rs:475` 始终自动分类。因此用户在粘贴时手填的主题不会保存。这直接违背 `work/CHANGES-T001.md:163`“主题可在粘贴/编辑时手动填写”的说明。应打通前端类型、Tauri 输入结构和 Rust 写入逻辑，并补充手填主题持久化测试；空主题可继续使用自动分类。

2. **资料库选择器在取消或成功关闭后没有清空选择，换目标分区后可能误加上次文章。**  
   打开对话框的逻辑 `src/library/LibraryPicker.tsx:55-82` 重置了目标、搜索、错误和忙碌状态，却没有重置 `selected`；`src/library/LibraryPicker.tsx:93-98` 又把 `previous` 与本次 `initialIds` 合并。取消按钮在 `src/library/LibraryPicker.tsx:280` 仅调用 `onClose`，成功添加在 `src/library/LibraryPicker.tsx:141-149` 后也未清空选择。复现路径：在分区 A 勾选文章并取消 → 对分区 B 打开选择器 → 旧选择仍被计入“已选”，点击添加会写入 B。应在每次打开时以本次 `initialSelectedIds` 重建选择，而不是合并上次状态，并补“取消后换分区重开”的 UI 测试。该问题影响 `项目方案.md:114` 的分区选择与取消验收。

3. **验收阻断：真实桌面进程重启和 SQLite 持久化尚未实测。**  
   `src/App.test.tsx:80-85` 的“重启”只是在同一 storage 上重新挂载 `App`，不能验证真实 Tauri 进程、应用数据目录和 SQLite 文件；该测试也只使用一篇文章，没有覆盖“切换到另一篇再切回”。交付说明明确把桌面实测列为待办（`work/CHANGES-T001.md:171-179`）。本次已跑通 Rust 数据库测试，但没有启动 Tauri 窗口，因此三段建篇后改第二段、切换文章、关闭并重开应用、分区重命名与成员顺序重启保留等仍须按该清单实机验收；这不是新增代码缺陷，但在完成前不能签署全部通过。

### 建议（可后续）

1. **补齐 ARIA 菜单的方向键交互。**  
   `src/components/PopoverMenu.tsx:28-53` 只实现首项聚焦、外部点击和 Esc，`src/components/PopoverMenu.tsx:64-78` 的菜单项都留在普通 Tab 顺序中，没有 Up/Down、Home/End 和 roving tabindex。当前键盘用户仍可用 Tab 到达操作，所以不阻断基本流程，但与 `work/CHANGES-T001.md:26` 的“键盘菜单”表述不完全相称，也未完整实现标准 `role="menu"` 交互。建议实现方向键循环、首尾跳转，并增加键盘测试。

2. **防止慢请求覆盖用户后选中的文章。**  
   `src/App.tsx:149-161` 的 `loadAndSetArticle` 没有请求序号或取消检查，`src/App.tsx:275-289` 允许连续发起选择；资料库打开路径 `src/App.tsx:291-319` 也相同。若 A 请求后于 B 返回，A 会覆盖 B 的正文和分区状态。建议只让最后一次选择提交状态，并用可控延迟的 API 增加回归测试。

3. **浏览器 mock 的批量加入不是全有或全无，与 SQLite 事务语义有差异。**  
   `src/data/mock.ts:264-272` 在循环中直接修改内存 `state`，若有效 ID 之后遇到不存在的 ID，`articleById` 抛错，但前面已加入的成员仍留在当前实例中；Rust 路径则在 `src-tauri/src/db.rs:572-618` 使用事务，错误会回滚整批。正常 UI 只提交资料库已有 ID，因此暂不阻断桌面验收；建议 mock 先校验全部 ID、再统一修改并持久化，以保持 `work/CHANGES-T001.md:58` 所述两端语义一致。

4. **损坏的段落 JSON 不应静默显示为空文章。**  
   `src-tauri/src/db.rs:196-198` 对反序列化失败使用 `unwrap_or_default()`，列表和详情会把损坏或暂不兼容的数据变成零段，而不向用户报错。当前正常写入均经过 `serde_json::to_string`（`src-tauri/src/db.rs:476`、`:547`），不影响本轮正常路径；建议后续返回带文章上下文的错误，便于旧数据升级和故障诊断。

### 确认可行（验证过）

1. **数据库迁移和连接配置可行。** 每个未执行迁移在独立事务中执行并记录版本（`src-tauri/src/db.rs:104-142`）；连接启用 WAL、外键和 5 秒忙等待（`src-tauri/src/db.rs:145-157`）。默认分区回填由迁移版本保证只执行一次（`src-tauri/migrations/0002_default_section.sql:1-13`）。`cargo test` 中旧库升级、重复迁移不重新加回已移除文章的用例通过（`src-tauri/src/db.rs:791-808`）。

2. **粘贴建篇具备事务和空输入保护。** 标题、正文在写入前校验（`src-tauri/src/db.rs:462-475`），文章与默认分区成员在同一 `Immediate` 事务中写入并提交（`src-tauri/src/db.rs:477-509`）。三段粘贴、空标题/正文拒绝的 Rust 测试通过（`src-tauri/src/db.rs:811-829`）；前端三段路径和空标题提示由 `src/App.test.tsx:21-38`、`:41-86` 覆盖，空标题/正文的数据层拒绝由 `src/data/mock.test.ts:24-33` 覆盖，相关测试均通过。

3. **版本冲突采用原子条件更新，不会因预检与写入分离而丢失更新。** `expected_version` 先提供明确错误（`src-tauri/src/db.rs:533-546`），真正写入同时使用 `WHERE id = ? AND version = ?` 并检查受影响行数（`src-tauri/src/db.rs:548-560`），因此并发竞争下也只有匹配版本的写入能成功。版本加 1 和旧版本拒绝的测试通过（`src-tauri/src/db.rs:831-862`）；阅读器与资料库编辑均提交 `expectedVersion`（`src/App.tsx:245-251`、`src/library/ArticleEditDialog.tsx:79-85`），失败后保留当前草稿并显示 `role="alert"` 错误（`src/App.tsx:258-265`、`src/reader/ArticleEditor.tsx:60-67`）。

4. **SQLite 分区去重和移除保留原件可行。** 数据库主键约束为 `(section_id, article_id)`（`src-tauri/migrations/0001_core.sql:40-46`）；批量写入另有 `HashSet` 输入去重、已有成员检查和事务（`src-tauri/src/db.rs:564-620`）。移除只删除 `section_articles` 成员（`src-tauri/src/db.rs:622-637`）。跨分区、重复输入返回 `added = 1`、再次添加返回 0、移除后原件仍在的 Rust 测试通过（`src-tauri/src/db.rs:865-882`）；前端多选、“已添加”禁用和移除后资料库保留的 UI 测试也通过（`src/App.test.tsx:88-157`）。

5. **双侧栏可独立收起，编辑入口仍可达。** 左右侧栏分别由 `listOpen`、`sideOpen` 控制（`src/App.tsx:107-127`、`:509-607`），收起后的恢复按钮独立渲染（`src/reader/ReaderView.tsx:71-103`），编辑表单位于主区域（`src/reader/ReaderView.tsx:106-116`）。前端测试实际依次收起/展开两侧并检查修改后的正文仍可见（`src/App.test.tsx:41-86`），测试通过；真实窗口的宽窄尺寸操作仍属于第 3 项实机验收。

6. **对话框具备基本可访问性。** `src/components/Modal.tsx:30-44` 实现初始聚焦和关闭后焦点恢复，`:46-72` 实现 Esc 与 Tab 圈定，`:83-92` 提供 `role="dialog"`、`aria-modal` 和标题关联；图标按钮有明确 `aria-label`（`src/components/IconButton.tsx:21-30`），草稿字段均有标签且英文正文设置 `lang="en"`（`src/components/ArticleDraftFields.tsx:27-58`）。焦点返回发起按钮的 UI 测试通过（`src/App.test.tsx:159-168`）。菜单方向键缺口已单列为建议，不影响对上述已验证能力的确认。

7. **前后端命令契约与序列化形状匹配。** Rust `ArticleDetail` 用 `#[serde(flatten)]` 展开摘要（`src-tauri/src/db.rs:38-47`），与 TypeScript `ArticleDetail extends ArticleSummary` 对齐（`src/data/types.ts:11-31`）；11 个命令在 `src-tauri/src/lib.rs:29-109`、`:122-134` 注册，`src/data/tauriApi.ts:13-30` 使用对应 camelCase 参数。TypeScript 构建和 Rust 测试编译均通过。


## 反审记录（R1）

反审日期：2026-11-21。仅核验严重问题第 1、2 项及其新增测试，未修改实现代码。

1. **通过：粘贴主题已打通全链路，手填优先、空白回退及前后端契约一致。**  
   `src/library/PasteDialog.tsx:52-56` 将 `draft.topic` 随标题、正文一起提交；`src/data/types.ts:59-60` 定义可选 `topic` 并明确省略或为空时自动分类；`src/data/mock.ts:205-216` 使用 `input.topic?.trim() || classifyTopic(...)`，与桌面端语义一致。`src/data/tauriApi.ts:21` 以 `{ input }` 原样调用 `paste_article`，`src-tauri/src/lib.rs:66-72` 接收 `PasteArticleInput` 并传递 `input.topic.as_deref()`；`src-tauri/src/db.rs:59-66` 的输入结构同为 camelCase，且 `#[serde(default)]` 支持字段缺失。写入前在 `src-tauri/src/db.rs:478-482` 去首尾空白，非空手填值优先，空白或缺失回退自动分类，最终在 `src-tauri/src/db.rs:487-490` 写入 SQLite。未发现主题被覆盖或静默丢弃的剩余路径。

2. **通过：LibraryPicker 的打开重建及取消、成功、Esc 清空已修复原状态残留问题。**  
   每次打开都会在 `src/library/LibraryPicker.tsx:54-83` 重置目标为本次 `defaultTarget`，用本次 `initialSelectedIds` 创建全新 `selected`，并清空 `addedIds`；父组件在 `src/App.tsx:617-629` 传入当前 `picker` 的目标和初始 ID。目标分区加载后，`src/library/LibraryPicker.tsx:85-105` 只过滤当前选择中已加入目标分区的 ID，不再合并历史状态，因此原“A 勾选并取消 → B 打开 → 误带旧选择”的路径在实现上已切断。取消及统一关闭走 `close()`，先执行 `resetSelection()`（`src/library/LibraryPicker.tsx:140-148`、`:290-292`）；成功添加后同样在关闭前清空（`src/library/LibraryPicker.tsx:150-164`）。`Modal` 的 Esc、遮罩和关闭图标均调用该 `onClose={close}`（`src/components/Modal.tsx:46-52`、`:77-92`），所以这些入口也会清空选择。

3. **不通过（测试覆盖完整性）：主题场景覆盖充分，但选择器新增测试没有实际复现“换目标分区”。**  
   主题部分覆盖有效：`src/App.test.tsx:170-196` 通过真实表单输入手填主题，并在同一 storage 重建 `App` 后验证保留；`src-tauri/src/db.rs:839-867` 分别验证手填主题去空白并持久化、纯空白主题回退、字段缺失回退。选择器测试 `src/App.test.tsx:198-248` 能验证“取消后重开不保留旧勾选”，其未勾选、已选 0 篇、添加禁用和分区仍为空的断言可以捕捉原缺陷；但第一次打开在 `src/App.test.tsx:218-227`、第二次打开在 `:232-240` 都通过同一个「本周精读」分区菜单，没有从分区 A 切换到分区 B，因而测试名中的“换分区”及原报告的完整复现路径未被逐字覆盖。成功添加和 Esc 后的清空也只有代码核验，没有新增 UI 回归测试。该覆盖缺口不推翻第 2 项实现通过的结论，建议补一条 A 取消、B 重开并尝试添加的用例。

实际执行：`npm test` 通过（2 个测试文件、10 个测试）；`cargo test` 通过（11 个 Rust 测试）。原严重问题第 3 项的真实 Tauri 进程重启与 SQLite 实机持久化验收不在本次范围内，仍按原报告保留。
