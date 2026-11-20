# 英语精读
本地网页。导入整套四六级 PDF 后按篇阅读，也可粘贴单篇。支持划词、段落与全文翻译、句式解析、收藏和两类复习。

## 启动
在项目目录打开 PowerShell。当前电脑已安装依赖，可直接执行启动命令。移到新电脑时，用 Python 3.11 或更新版本逐行执行下面两条安装命令：

~~~powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
~~~

启动命令：

~~~powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
~~~

看到 Uvicorn running 后，访问 http://127.0.0.1:8000/ 。保留 PowerShell 窗口，结束时按 Ctrl+C。只复制代码块里的命令，每行单独执行。FastAPI 接口文档在 http://127.0.0.1:8000/docs 。

## 启用翻译与解析
在启动服务的同一个 PowerShell 窗口运行下方命令，出现提示后输入你的 DeepSeek API Key，再执行启动命令。输入时屏幕会遮挡 Key。当前窗口关闭后，下一次启动需要重新设置。

~~~powershell
$env:DEEPSEEK_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'DeepSeek API Key' -AsSecureString)).Password
~~~

可用 DEEPSEEK_MODEL 环境变量选择模型。导入、编辑和已收藏内容的复习可离线使用。请求翻译或解析时，选定内容及必要上下文会发给 DeepSeek。本地数据库文件是 reader.sqlite3。

## 使用顺序
1. 粘贴一篇英文，或导入有文字层、含标准阅读分节的单套 PDF。试卷通常拆成四篇，可以逐篇编辑正文。遇到不匹配的版式，可以粘贴正文继续阅读。
2. 点击文章卡片。选一个词，会在选区旁显示释义；选多个词，会出现翻译和解析。短语翻译后可收藏词语，单句解析后可收藏长难句。
3. 段落和全文也可分别翻译，结果显示在右侧。
4. 进入单词复习或长难句复习，回忆后揭晓。记得移出本轮，忘了排到队尾。

从《代码地图》开始读代码。用 .\.venv\Scripts\python.exe smoke_check.py 在临时数据库验证接口。
