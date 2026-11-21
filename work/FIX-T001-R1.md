# T-001 修复轮 R1 说明

日期：2026-11-21  
范围：只处理 `work/REVIEW-T001.md`【严重问题】第 1、2 项。第 3 项（真实 Tauri 窗口与 SQLite 重启实测）按报告仍为验收阻断项，留给负责人实机执行。未修改报告【建议】4 项，未修改 `backend/`、`reader-preview/`、`项目方案.md`、`work/TASKS.md`。

## 1. 粘贴对话框的主题输入不再被丢弃

修复内容：

- `src/library/PasteDialog.tsx:52` 提交粘贴时把 `draft.topic` 一并传给 `api.pasteArticle`。
- `src/data/types.ts:59-60` 的 `pasteArticle` 输入类型增加可选 `topic`；省略或空字符串表示自动分类。
- `src/data/mock.ts:205-216` 同步语义：手填主题（去首尾空白）优先，为空时回退到 `classifyTopic`。
- `src-tauri/src/db.rs:59-66` 的 `PasteArticleInput` 增加可选 `topic` 字段。
- `src-tauri/src/db.rs:464-482` 的 `paste_article` 接收 `Option<&str>`：非空手填主题保存原文（去首尾空白），空字符串或缺失时继续按正文自动分类。
- `src-tauri/src/lib.rs:66-71` 命令层把 `input.topic` 传入数据层；`src/data/tauriApi.ts` 原样转发输入对象，前端与 Rust 的 camelCase 契约一致。

新增测试：

- `src-tauri/src/db.rs:839` `manual_topic_is_persisted_and_empty_topic_is_classified`：手填主题写入后经 `get_article` 重新读取仍为「健康与环境」；空白主题和缺失主题都回退为自动分类结果「教育与学习」。
- `src/App.test.tsx:170` `粘贴时手填的主题会持久保存`：正文会自动分类为「教育与学习」，在对话框手填「城市与生活」后保存，资料库列表显示手填主题；卸载并用同一 storage 重建 `App` 后主题仍为「城市与生活」。

## 2. 资料库选择器每次打开重建选择

修复内容（`src/library/LibraryPicker.tsx`）：

- 移除了跨次打开的 `initialIds` 状态。打开时（`:54-83`）直接用本次 `initialSelectedIds` 重建 `selected`，并清空 `addedIds`，不再与上次遗留的勾选合并。
- 目标分区文章加载后（`:85-105`）只从当前选择中剔除已在目标分区的文章，不再重新并入上次状态。
- 新增 `resetSelection()` 和 `close()`（`:140-148`）：取消、关闭图标、Esc、点击遮罩都走 `close()`，先清空选择再关闭；成功添加后也在关闭前清空（`:150-164`）；「去资料库导入」同样清空选择。
- 勾选框状态、「已选 N 篇」计数和「添加」按钮均基于重建后的选择，取消后重开不会再误加上次文章。

新增测试：

- `src/App.test.tsx:198` `资料库选择器取消后换分区重开不会带上上次勾选`：新建空分区「本周精读」，通过该分区菜单打开选择器，勾选一篇（显示「已选 1 篇」、添加可用）后取消；重新通过同一分区菜单打开，断言勾选框未选、「已选 0 篇」、添加按钮禁用，且该分区仍未加入文章。

## 验证结果

- `npm test`：2 个测试文件、10 个前端测试全部通过（原 8 个 + 新增 2 个）。
- `npm run build`：`tsc --noEmit` 与 Vite 构建通过。
- `cargo test`：11 个 Rust 测试全部通过（原 10 个 + 新增 1 个）。

本次未启动真实 Tauri 窗口，未做桌面进程重启与 SQLite 文件持久化实测；该项仍按 `REVIEW-T001.md` 严重问题第 3 项由负责人实机验收。

## R1.1 补测试

- `src/App.test.tsx` 新增用例 `分区 A 取消勾选后从分区 B 重开不会误加文章`：创建「分区 A」和「分区 B」，在 A 的资料库选择器勾选文章后取消，再从 B 打开选择器；断言勾选框未选、「已选 0 篇」、添加按钮禁用，并通过 Esc 关闭后确认 A、B 均未加入文章。本次只新增测试，未修改实现代码。
- 实际执行 `npm test`：2 个测试文件、11 个前端测试全部通过。