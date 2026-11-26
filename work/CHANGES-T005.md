# 阶段 5 · Windows 交付

## 来源与代码核对

构建基线是 GitHub 提交 [afa5defb](https://github.com/tzq-tbw/yuejian-reader/commit/afa5defb)。该提交同时包含 R7 和 R7.1。项目台账与复审记录确认九个审查事项及一次跨作文预览回归的修复已合入。定向前端回归覆盖作文会话、历史只读、清空后迟到响应、跨日复习、AI 输入及翻译并发等路径。R7 迁出了桌面端旧浏览器密钥，阶段 5 进一步迁移到 Windows 凭据管理器。

## 实现与交付

- NSIS 生成 Windows x64 安装包。发布脚本输出同版本的安装包、Tauri 更新签名和 `latest.json`。签名私钥留在发布机，应用内只含验证公钥。
- 桌面启动检查更新，也可以在设置中手动检查。Tauri 从 GitHub Releases 读取版本和签名，用同一版本安装包执行静默更新。
- Windows 旧凭据文件在成功写入凭据管理器后移除。隔离测试使用虚构值验证了读写、覆盖、删除、迁移与迁移失败保留旧文件。
- 新增传输回归覆盖请求头、429、非法 JSON、超时和连接失败。答辩准备见 [桌面 AI 调用学习与展示](桌面AI调用学习与展示.md)。

已公开发布 [阅间 v0.1.0](https://github.com/tzq-tbw/yuejian-reader/releases/tag/v0.1.0)。安装包 SHA256 为 `60e127a6bc81c1f84e4c18a674e41c6040b647c37c6e0dfc326eceea8efa4f39`。

## 实测结果

| 项目 | 结果 |
|---|---|
| 构建与分发 | TypeScript、Vite 和 Rust release 构建通过。已核对公开更新清单与安装包地址。 |
| Windows 独立环境 | GitHub Windows 运行器从公开链接下载并校验 SHA256，NSIS 安装成功。安装版启动窗口，把旧 SQLite 从版本 1 升级到 6，原文章及默认分区在关窗重启后仍在。 [安装验收](https://github.com/tzq-tbw/yuejian-reader/actions/runs/45808878901) |
| R7/R7.1 与真题 | 最终前端回归 162 项通过、1 项跳过，含两项真实四级样卷检查。Rust release 回归 44 项通过、1 项跳过。 |
| 模型联调 | 基线与真实样卷、Magpie 一起运行时，158 项前端测试通过。最终回归时，本机 Magpie 端口拒绝连接，安装版真实查词待验。 |
| 交互和更新 | 整套安装版 UI 逐项演示待验。当前只有首个 Release，真实的跨版本下载、签名拦截和静默升级实测待下一个版本。 |

## 验收入口

1. 本机安装按 [README](../README.md) 操作。已有数据保留在相同应用标识的目录下。
2. `Validate Windows installer` 工作流在干净 Windows 运行器上验安装包 SHA256、安装、首次启动、版本 1 数据库迁移与重启留存。验收脚本也可以在新 Windows 用户下运行，使用自行生成的例文。
3. 交互验收按 [项目方案第五节](../项目方案.md#五整体验收脚本) 核对真题导入、精读、分区、收藏、复习和编辑留存。真实模型测试使用工程内的示例句。

## 交接

- 断点集中在 `scripts/build-windows.ps1`、`src-tauri/src/updater.rs`、`src-tauri/src/credentials/` 和 Windows 验收脚本。
- 下一次发布要同时更新版本号，沿用现有签名密钥，重新生成并发布三项资产。
- 保留 R7/R7.1 的数据回归修复、应用标识、既有数据库迁移顺序和 updater 公钥。
