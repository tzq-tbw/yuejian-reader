# 用一次划词讲清楚桌面端如何调用 AI

**演示目标**：在安装好的阅间中，连续查询两处 `address`，解释为什么一次是“处理”、一次是“地址”，并沿着实际代码指出哪一步提取上下文、哪一步发送网络请求、哪一步更新侧栏。入口是阅间桌面窗口，Rust 实现位于 [src-tauri/src/lib.rs](../src-tauri/src/lib.rs)。[浏览器和桌面的通道选择](../src/language/transport.ts)

## 准备一篇两段的文章

在资料库粘贴下面的文章，标题填 `Two uses of address`。先在设置中选择已经验证可用的模型配置；演示时直接回到精读页。

> We need to address the problem before the meeting.
>
> Please write your address on the envelope.

自己运行成功之前，把下文的“处理”“地址”当作预期答案。未配置供应商时，可以先练读代码和离线测试；现场若用测试结果说明机制，就明确说“这是离线测试”。

## 学习路线：每遍解决一个问题

| 轮次 | 打开哪些函数 | 具体动作与过关标准 |
|---|---|---|
| 一、材料从哪里来 | [askWord、execute、isCurrent](../src/language/useReadingAssistant.ts) → [buildWordCardMessages](../src/language/prompts.ts) | 选中第一个 address，点击“查看词卡”。在代码里分别指出词、原句、段落、标题。说明 system 消息限定任务和词卡字段，user 消息承载这次选中的材料。 |
| 二、谁真正发请求 | [wordCard、complete](../src/language/service.ts) → [createDefaultTransport、createTauriTransport](../src/language/transport.ts) → [ModelChatInput、chat_url、model_chat](../src-tauri/src/lib.rs) | 画出“网页界面 → Tauri 命令 → 模型服务”。解释 invoke 是同一桌面应用里的调用，Rust 的 reqwest 才发 HTTP。指出 Key 的请求头位置、模型名和 messages 的请求体位置。 |
| 三、回复如何变成词卡 | [extractChatContent、parseWordCardResponse](../src/language/parse.ts) → [wordCard](../src/language/service.ts) → [execute](../src/language/useReadingAssistant.ts) | 顺着一条成功响应划出三层：供应商响应对象、模型输出文本、界面词卡。指出 Rust 检查 HTTP 和外层 JSON，前端从 choices 取内容，检查或规范化词卡字段。 |
| 四、请求失败或迟到 | [model_chat](../src-tauri/src/lib.rs) 和 [阅读助手测试](../src/reader/ReadingAssistant.test.tsx) | 分别说明超时、HTTP 错误、输出截断和切换文章。能指出哪些错误来自 Rust，哪个来自输出解析，以及过期请求为何不能覆盖当前文章。 |

**读 Rust 时只跟住这六步。** 第一，`#[tauri::command]` 标记前端可调用的命令，注册在 `generate_handler!` 中；`serde(rename_all = "camelCase")` 让前端的 `baseUrl` 对应 Rust 的 `base_url`。第二，`chat_url` 检查 http/https 前缀、去掉末尾斜杠，再补上 `/chat/completions`。第三，客户端设置连接超时 8 秒，总超时缺省 90 秒，允许设置在 1 至 180 秒之间。第四，构造 POST 请求：`model`、`messages`、采样参数和可选的输出长度写入 JSON，`stream: false` 表示整次接收，配置了 Key 时才附加 Bearer 请求头。第五，`send().await` 等待响应，分别映射连接失败和超时；收到非成功 HTTP 状态时取状态码及最多 600 个字符的错误摘要。第六，成功时读为 JSON 对象返回；单词释义取自模型输出，由前端解析成可展示的数据。

**用一组数据练口述。** 词卡请求的消息中，`选中的单词` 为 address，`原句` 为第一句。前端预期收到的词卡字段有 `word`、`partOfSpeech`、`contextualMeaning` 等。对该句可预期 `contextualMeaning` 为“处理、应对”，原句仍取自页面的选区。换到第二句，目标词相同，原句、段落和预期释义改变。重复演示时不承诺模型逐字返回相同措辞。

## 四分钟展示

| 时间 | 动作 | 一句讲解 |
|---|---|---|
| 0:00–0:45 | 在桌面应用打开例文，框选第一句的 address，点击查看词卡。 | “查词时应用把原句和段落一起交给模型，这样它能判断这里的动词用法。” |
| 0:45–1:35 | 打开 transport.ts，定位 `invoke("model_chat", …)`；跳到 lib.rs 的同名函数。 | “界面把配置和消息传进本机 Rust，Rust 用 HTTP 客户端访问配置的模型服务。切到普通浏览器时会选择另一种传输方式。” |
| 1:35–2:40 | 顺着 `client.post`、`bearer_auth`、`status.is_success()` 和解析返回值讲。 | “请求体说明问什么、用哪个模型；请求头可带身份凭据。拿到回复还要先看状态，再检查内容能否解析。” |
| 2:40–3:25 | 选第二句中的 address，比较这次词卡，指出原句与语境义。 | “同一个词在这里表示地址。原句是程序取的，模型提供释义，界面把两者组合成词卡。” |
| 3:25–4:00 | 打开一个熟悉的失败用例，展示测试名称、断言和运行结果。 | “用户已经切换文章时，旧请求可能仍然返回。程序核对请求序号、文章 ID 和版本，只更新仍对应当前阅读内容的结果。” |

**被问到来源时**，按照自己实际完成的部分说明。基于现有实现学习后，可以说：“这段使用了项目已有的 Rust 实现，我重点研读了请求构造、鉴权、异常和结果返回。”亲自跑过用例后，可以补充自己的输入、看到的结果和解释。考核里的手写要求单独落实，例如亲自为 `chat_url` 加一个边界用例，并能现场修改输入、预测结果；声明自己亲写的范围为这条测试，是否满足老师对业务代码的要求以现场标准为准。若要把业务逻辑列为手写，可以亲自实现一项可验证的改进，例如给 HTTP 429 附上等待后重试的说明，再展示自己的差异和用例。

## 五道可现场复现的追问

1. **为什么同一句从浏览器预览和桌面启动会经过不同代码？** 找 `__TAURI_INTERNALS__`，分别指出 fetch 和 invoke 两个分支。运行安装包演示 Rust 路径。
2. **收到 HTTP 200 就一定能显示词卡吗？** 举两个失败位置：响应体不是有效 JSON；外层对象正确但输出被截断，`finish_reason === "length"`。后者在前端解析时报错。[解析用例](../src/language/parse.test.ts)
3. **未填 Key 一定不能调用吗？** 看 `if !key.is_empty()`。本地代理可自行完成认证；直连时是否需要 Key 取决于目标服务。Rust 根据配置附加请求头。
4. **翻译一篇六段文章，切换文章后还有请求吗？** 最多三个工作者发请求，切文后停止取下一段。已发请求可以返回，页面会忽略旧结果。定位 `translateArticle` 与 `isCurrent`。
5. **哪些验证必须在现场单独说清？** 本地单元测试能检查地址拼接、解析结果、迟到响应处理。真实模型连通性要在实际端点、网络和凭据下完成。安装包能启动不能替代模型调用实测。

## 自测命令

在仓库根目录 PowerShell 运行。三条命令依次验证前端行为、Rust 地址处理和真正走本机 HTTP 的 Rust 请求。最后一组使用临时端口与测试字符串，覆盖鉴权头、429 摘要截断、无效 JSON、超时和连接拒绝。当日结果以终端输出为准。

~~~powershell
npm test -- src/language/prompts.test.ts src/language/parse.test.ts src/language/transport.test.ts src/reader/ReadingAssistant.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml chat_url
cargo test --manifest-path src-tauri/Cargo.toml model_transport_tests
~~~

仓库有一个默认忽略的 `model_chat_round_trip`，绑定固定本机 Magpie 代理和模型名。只有确认该代理运行且有相应权限时才单独执行；安装包“设置”中填写其他供应商不会改变这条测试的固定输入。检验自己配置的供应商，直接用桌面词卡即可。[测试实现](../src-tauri/src/lib.rs)

## 原审查的问题核对

依据私仓修复提交 `afa5defb0fa1c3763dfb9e9858b4ba7c752210b8` 的源码、具名回归用例和仓库验收记录。表中“覆盖”指该版本已有对应测试，不等于已在每台安装环境手动复现。

| 原问题 | 已落地的处理和证据 |
|---|---|
| 作文 A/B 错位、历史查看覆盖正文 | 草稿与所属 ID 同会话保存；历史预览独立只读。R7.1 修正跨文档预览改变会话归属，覆盖“编辑 A、预览 B、切页返回 A”和显式恢复后再次编辑。[实现](../src/essay/EssayPage.tsx) · [回归测试](../src/essay/EssayPage.test.tsx) |
| 清空后旧批改重新写入 | 清空同时重置作文会话，异步返回前校验会话请求标识。用例等待旧响应返回，再断言数据库和会话为空。[清空入口](../src/App.tsx) · [用例](../src/essay/EssayPage.test.tsx) |
| 跨午夜继续评分、AI 提醒使用旧队列 | 评分前重读日期；跨日重载后再评分。AI 输入、剩余数量从 queue 派生；刷新保留顺序并追加新到期卡。[实现](../src/review/ReviewPage.tsx) · [用例](../src/review/ReviewPage.test.tsx) |
| 全文翻译同时启动过多任务 | 最多三个工作者，切文后停止派发剩余段落。在途请求的延迟结果不会展示。[实现](../src/language/useReadingAssistant.ts) · [用例](../src/reader/ReadingAssistant.test.tsx) |
| localStorage 保存密钥 | R7 桌面版先迁移旧配置再移除原字段，从独立文件读取 Key。R7 的 Windows 文件仍为明文；第五阶段系统凭据的实际方式及验证以当前 credentials.rs 和第五阶段验收记录为准。[配置](../src/language/config.ts) · [凭据实现](../src-tauri/src/credentials.rs) |
| 快速点两个文章入口时慢响应覆盖最新文章 | 统一 openArticle，以请求序号只接受最后一次点击。[实现](../src/App.tsx) · [用例](../src/App.test.tsx) |
| 作文列表总是读取全部历史 | 初次加载摘要，展开时读取详情，修改操作局部更新。R7.1 补齐新建、重命名、删除后的断言。[Rust 查询](../src-tauri/src/essay_history.rs) · [用例](../src/essay/EssayPage.test.tsx) |

R7.1 记录的前端测试为 155 项通过、3 项跳过。R7 记录的 Rust 测试为 39 项通过、1 项真实代理测试忽略。两组数字属于历史记录；本次安装包测试与在线模型实测应分别标明。[R7 审查和 R7.1 补充](REVIEW-R7.md) · [R7 变更](CHANGES-R7.md)
