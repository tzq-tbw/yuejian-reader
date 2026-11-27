# 英语精读网页版

在本机浏览器里阅读英文、查词和复习。可以粘贴文章，也可以从有文字层的真题 PDF 提取阅读文章。支持划词查义、句式解析、翻译选区或段落、全文翻译，以及收藏生词和长难句。

## 启动网页

需要 Python 3.11 或更新版本。在 [GitHub 仓库](https://github.com/tzq-tbw/yuejian-reader)点击「Code → Download ZIP」，解压后进入 `web-demo` 目录，在这里打开 PowerShell 并安装依赖：

~~~powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
~~~

依赖只需安装一次。使用时，在 `web-demo` 目录启动服务：

~~~powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8002
~~~

启动后用同一台电脑打开 [英语精读网页](http://127.0.0.1:8002/)。使用期间保留 PowerShell 窗口，结束时按 Ctrl+C。

## 启用 AI

使用查词、翻译或解析前，在启动服务的 **同一个 PowerShell 窗口**执行下面两行。第一行会提示输入你的 DeepSeek API Key，输入内容会被遮挡。如果网页服务已经运行，先按 Ctrl+C 停止，配置好再启动。

~~~powershell
$env:DEEPSEEK_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'DeepSeek API Key' -AsSecureString)).Password
$env:DEEPSEEK_MODEL = 'deepseek-flash'
~~~

## 使用方法

1. **添加文章**。在「文章库」填写标题、粘贴英文正文，再点「保存文章」。也可以选择有文字层的整套 PDF，点「导入试卷」。若试卷版式无法识别，可以复制阅读正文再粘贴。
2. **精读**。打开文章卡片。鼠标选中一个词，网页会显示语境义。选中多个词可点「翻译」或「解析」。全部或单段翻译使用对应按钮。
3. **收藏和复习**。在查词或解析结果旁收藏词语或长难句，再打开顶部的「单词复习」或「长难句复习」。先回忆再揭晓，点「忘了」会排回本轮队尾。

文章和收藏保存在本机。添加文章、编辑正文和复习已有收藏可以离线使用。
