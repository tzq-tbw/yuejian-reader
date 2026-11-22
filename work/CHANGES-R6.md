# R6 迭代交付说明

日期：2026-11-22

## 1. 阅读页三词表分色

- `src/reader/ReaderView.tsx` 继续按命中项的 `list_id` 输出 `cet4`、`cet6`、`ky` 类，并新增当前启用词表图例。
- `src/styles.css` 定义四级蓝、六级紫、考研橙三套底色与下划线。重叠词保留全部命中类，使用分色渐变底和多层下划线，同时显示全部命中类别。
- `src/reader/ReaderView.test.tsx` 覆盖单表类、三表重叠类、图例和三色计算样式。

## 2. 作文批改历史

- 新增迁移 `src-tauri/migrations/0006_essay_history.sql`：
  - `essay_documents`：稳定序号、修改区名称、当前正文和时间戳。
  - `essay_revisions`：所属作文、历次序号、当次正文快照、完整批改结果 JSON 和时间戳；删除作文时级联删除历史。
- 新增 `src-tauri/src/essay_history.rs` 及 Tauri 命令，覆盖作文列表、新建、重命名、正文更新、删除，以及批改记录新增和删除。保存批改记录与更新当前正文在同一事务中完成。
- `src/data/types.ts`、`src/data/tauriApi.ts`、`src/data/mock.ts` 提供一致的桌面端与浏览器 mock 契约；mock 可跨实例恢复历史。清空全部数据也会清空作文及批改历史。
- `src/essay/EssayPage.tsx` 新增默认收起的历史侧栏。列表默认只显示作文序号，可展开历次批改；支持选择历史版本、新建修改区、重命名和删除。同一作文重复批改追加在同一序号下。
- 当前选中序号会跨页面恢复；正文在失焦或提交批改时保存。旧响应隔离逻辑保留，过期响应不会写入历史。

## 3. GitHub 在线导词表

- 新增 `src/language/onlineWordlist.ts`，仅接受 `https://raw.githubusercontent.com/` Raw 地址，检查下载状态与文件大小，解析后复用现有词表入库通道。
- 四级：`yiyisheh/CET4-vocabulary` 的 `output/high_freq_surface_df.csv`，解析 `rank,word`，只取 rank 1–1200，剔除纯功能词。
- 六级：`wangjiuyi543-ui/cet6-vocabulary` 的 `cet6_core_words_top500_simple.md`，解析 Markdown 表格序号列、粗体或代码标记单词。
- 考研：`wyyxdgm/dc` 的 `master/dcb.txt`，解析逗号分隔文本，去重并过滤短语、数字和非单词标记。
- 设置页提供三个已验证源的预设，也可输入 Raw URL、选择来源格式和目标词表名。在线内容保存为独立词表，不覆盖内置词表，列表来源标记为 GitHub。
- `src/language/onlineWordlist.test.ts` 覆盖三种格式、下载链路和 URL 限制；`src/settings/SettingsPage.test.tsx` 覆盖对话框到 mock 入库的完整流程。

## 4. 自定义模型服务

- 设置页新增「模型服务」区，可选默认 Magpie、DeepSeek、通义千问。
- DeepSeek 预填 `https://api.deepseek.com/v1` 与 `deepseek-chat`；通义千问预填 `https://dashscope.aliyuncs.com/compatible-mode/v1` 与 `qwen-plus`。
- Base URL、模型可编辑，API Key 使用密码输入框。配置保存到 `localStorage` 的 `yuejian.modelService`，界面注明阶段 5 迁移到系统凭据。
- `src/language/config.ts` 的配置优先级为：显式参数 > 本地保存配置 > 原有环境覆盖 > 默认 Magpie。
- `src/language/transport.ts` 每次请求重新解析配置；精读和作文服务均通过该动态通道调用。桌面端继续由 Rust `model_chat` 发请求，自定义 Key 仅加入本次 Bearer 请求头。
- `src/language/config.test.ts` 验证配置覆盖优先级，以及连续两次请求切换供应商时 URL、model 和 Authorization 均更新。

## 验证结果

- `npm test`：29 个测试文件通过，141 项通过；2 个文件、3 项按原条件跳过。随后新增的三色计算样式断言单独复跑通过。
- `cargo test`：37 项通过，0 失败；真实 Magpie 联调 1 项按原配置忽略。
- `npm run build`：TypeScript 检查与 Vite 生产构建通过。
- 三个真实 Raw 地址已实际下载并运行新解析链路：
  - 四级：1087 个有效单词（过滤功能词后）。
  - 六级：500 个单词。
  - 考研：2303 个有效单词。
- `git diff --check`：无空白错误，仅仓库既有的 LF/CRLF 提示。

未使用真实供应商密钥发起付费模型请求；DeepSeek/通义千问的实际账号连通性及桌面窗口人工操作仍需实机验收。
