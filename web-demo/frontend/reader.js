let readerVersion = 0;
const sentenceSegmenter = new Intl.Segmenter("en", {granularity: "sentence"});

function sentenceAt(text, offset) {
  for (const part of sentenceSegmenter.segment(text)) {
    if (offset < part.index + part.segment.length) return part.segment.trim();
  }
  return text.trim();
}

export function openReader(article, request, onSaved) {
  const version = ++readerVersion;
  const reader = document.querySelector("#reader");
  const original = document.querySelector("#original");
  const result = document.querySelector("#result");
  const status = document.querySelector("#reader-status");
  let currentRequest = 0;
  let currentSelection = 0;

  function button(label, action) {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = label;
    control.onclick = action;
    return control;
  }

  async function save(kind, target, sentence, meaning) {
    try {
      const response = await request("/api/favorites", "POST", {
        kind, target, original_sentence: sentence, meaning
      });
      status.textContent = response.created ? "已收藏。" : "这条内容已经收藏。";
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function explain(output, mode, selection, context = "", favorite = "", selectionId = currentSelection) {
    const requestId = output === result ? ++currentRequest : 0;
    const isCurrent = () => version === readerVersion && !reader.hidden &&
      (output === result ? requestId === currentRequest : selectionId === currentSelection);
    output.textContent = "正在请求 DeepSeek…";
    try {
      const {text} = await request("/api/analysis", "POST", {mode, selection, context});
      if (!isCurrent()) return;
      output.textContent = text;
      if (favorite) {
        const label = favorite === "word" ? "收藏词语" : "收藏长难句";
        output.append(button(label, () => save(favorite, selection, context || selection, text)));
      }
    } catch (error) {
      if (!isCurrent()) return;
      output.textContent = error.message;
      output.append(button("重试", () => explain(output, mode, selection, context, favorite, selectionId)));
    }
  }

  document.querySelector("#article-title").textContent = article.title;
  const editor = document.querySelector("#editor");
  editor.hidden = true;
  editor.elements.title.value = article.title;
  editor.elements.body.value = article.body;
  document.querySelector("#edit-toggle").onclick = () => { editor.hidden = !editor.hidden; };
  editor.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(editor));
    try {
      await request("/api/articles/" + article.id, "PATCH", data);
      onSaved({...data, id: article.id, title: data.title.trim(), body: data.body.trim()});
    } catch (error) {
      status.textContent = error.message;
    }
  };

  original.replaceChildren();
  status.textContent = "";
  result.textContent = "选中英文或点击翻译，结果会显示在这里。";
  document.querySelector("#translate-all").onclick = () => explain(result, "translation", article.body);
  for (const text of article.body.split(/\n\s*\n/)) {
    const paragraph = document.createElement("p");
    paragraph.lang = "en";
    paragraph.textContent = text;
    const tools = document.createElement("div");
    const local = document.createElement("div");
    local.hidden = true;
    local.className = "word-result";
    tools.append(button("翻译本段", () => explain(result, "translation", text)));
    original.append(paragraph, tools, local);

    function handleSelection() {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!paragraph.contains(range.startContainer) || !paragraph.contains(range.endContainer)) return;
      const target = selection.toString().trim();
      if (!/[A-Za-z]/.test(target)) return;
      const offset = range.startOffset + selection.toString().search(/\S/);
      const sentence = sentenceAt(text, offset);
      const endSentence = sentenceAt(text, range.endOffset - 1);
      const selectionId = ++currentSelection;
      const previous = original.querySelector(".word-result:not([hidden])");
      if (previous) previous.hidden = true;
      const bounds = range.getBoundingClientRect();
      local.style.top = (window.scrollY + bounds.bottom + 5) + "px";
      local.style.left = (window.scrollX + Math.max(8, Math.min(bounds.left, window.innerWidth - 320))) + "px";
      local.hidden = false;
      if (/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(target)) {
        explain(local, "word", target, sentence, "word", selectionId);
        return;
      }
      local.replaceChildren(
        button("翻译", () => {
          local.hidden = true;
          explain(result, "translation", target, sentence,
            sentence === endSentence && target !== sentence && !/[.!?]$/.test(target) ? "word" : "");
        }),
        button("解析", () => {
          local.hidden = true;
          const source = sentence === endSentence ? sentence : target;
          explain(result, "syntax", source, "", sentence === endSentence ? "sentence" : "");
        })
      );
    }

    paragraph.addEventListener("mouseup", handleSelection);
    paragraph.addEventListener("keyup", event => {
      if (event.shiftKey) handleSelection();
    });
  }
}

document.addEventListener("pointerdown", event => {
  const popup = document.querySelector(".word-result:not([hidden])");
  if (popup && !popup.contains(event.target)) popup.hidden = true;
});
