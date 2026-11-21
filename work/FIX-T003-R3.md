# T-003 R3 修复说明

日期：2026-11-21

## T-R3a：真实考试高频词表

- 删除 `vocabulary.ts` 内置四级小样例，新增三份独立数据：`wordlists/cet4.ts`、`wordlists/cet6.ts`、`wordlists/postgraduate.ts`，每表 1600 词。
- 数据来源为公开 ECDICT 词库，固定到提交 `39cfb9672c0906b63569e0453c2e6abfb9ab182a`。分别筛选 `cet4`、`cet6`、`ky` 考试标签，按当代语料库 `frq` 词频排名取前 1600 个纯英文单词；来源、许可与整理口径已写在各数据文件头。
- `VocabularyList`、`VocabularyMatch`、`TextToken` 及匹配、切分函数签名保持不变。默认列表同时启用四级、六级、考研三表，重叠词保留全部命中类别；也支持传入任意列表子集独立开关。
- `vocabulary.test.ts` 更新为 6 个用例，覆盖词表规模与去重、三表默认开启、屈折匹配、重叠词三类别 ID/中文标签显示、独立开关及未命中场景。

## T-R3b：划词工具条高对比配色

- `SelectionToolbar.tsx` 增加独立 `high-contrast` 主题标识。
- `styles.css` 仅针对该主题设置深蓝底（`#153f73`）、白色文字与图标、深蓝边框和阴影；悬停使用品牌蓝，焦点轮廓为白色。其他气泡组件样式不变。

## 验证

- `npm test`：12 个测试文件通过、2 个既有文件跳过；75 个测试通过、3 个既有测试跳过。
- `npm run build`：TypeScript 检查与 Vite 生产构建通过。
