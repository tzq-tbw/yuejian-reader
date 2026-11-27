# 英语精读 · Python 网页演示版

这是适合课堂展示的独立网页项目，使用 FastAPI、原生 JavaScript 和 SQLite。可以粘贴英文或导入带文字层的试卷，划词查义、翻译和析句，再收藏词句并复习。

## 启动

用 Python 3.11 或更新版本。在仓库根目录打开 PowerShell，逐行执行以下命令：

~~~powershell
cd web-demo
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
~~~

如要演示 AI，在同一个窗口配置自己的 DeepSeek Key。输入时屏幕会遮挡 Key。这里明确选用 DeepSeek 当前支持的 `deepseek-flash`。

~~~powershell
$env:DEEPSEEK_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'DeepSeek API Key' -AsSecureString)).Password
$env:DEEPSEEK_MODEL = 'deepseek-flash'
~~~

启动服务：

~~~powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8002
~~~

浏览器打开 [演示页面](http://127.0.0.1:8002/)。[FastAPI 接口试用页](http://127.0.0.1:8002/docs) 可以直接提交和查看请求。按 Ctrl+C 停止服务。导入、编辑和复习已有收藏无需 API Key。网页数据保存在本目录的 `reader.sqlite3` 中。

## 展示一条 AI 请求

1. 粘贴例句 `We need to address the problem before the meeting.`，填一个标题并保存。打开文章，选中 `address`。
2. 打开浏览器 F12 的「网络」，查看 `POST /api/analysis` 的请求数据。前端发送选中的词、原句和操作类型。
3. 顺着 [reader.js](frontend/reader.js) 的 `explain`，追到 [main.py](backend/main.py) 的 `analyze_text`，再看 [analysis.py](backend/analysis.py) 的 `analyze`。重点讲 URL、Bearer 鉴权、JSON 请求体、超时以及怎样从返回值取出模型答案。
4. 再用 `Please write your address on the envelope.` 查一次同一个词，观察原句如何影响释义。

在本目录运行 `.\.venv\Scripts\python.exe smoke_check.py` 可以用临时数据库检查首页、文章、收藏和样卷导入。真实模型请求由你的 Key 和服务配置决定。
