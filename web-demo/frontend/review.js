let reviewVersion = 0;

export function wordPosition(sentence, target) {
  const literal = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wholeWord = new RegExp(`(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])`, "iu");
  const start = sentence.search(wholeWord);
  return start >= 0 ? start : sentence.toLowerCase().indexOf(target.toLowerCase());
}

export async function openReview(kind, request) {
  const version = ++reviewVersion;
  const heading = document.querySelector("#review-title");
  const panel = document.querySelector("#review-card");
  heading.textContent = kind === "word" ? "单词复习" : "长难句复习";
  panel.textContent = "正在读取收藏…";
  let queue;
  try {
    queue = await request("/api/favorites?kind=" + kind);
  } catch (error) {
    if (version === reviewVersion) panel.textContent = error.message;
    return;
  }
  if (version !== reviewVersion) return;

  function button(label, action) {
    const control = document.createElement("button");
    control.textContent = label;
    control.onclick = action;
    return control;
  }

  function showNext() {
    panel.replaceChildren();
    if (!queue.length) {
      panel.textContent = "本轮复习完成。";
      return;
    }
    const card = queue[0];
    const hint = document.createElement("p");
    hint.textContent = "本轮剩余 " + queue.length + " 条";
    const prompt = document.createElement("p");
    prompt.lang = "en";
    const sentence = card.original_sentence;
    const start = kind === "word" ? wordPosition(sentence, card.target) : -1;
    if (kind === "word" && start >= 0) {
      const marker = document.createElement("mark");
      const end = start + card.target.length;
      marker.textContent = sentence.slice(start, end);
      prompt.append(sentence.slice(0, start), marker, sentence.slice(end));
    } else {
      prompt.textContent = sentence;
    }
    const reveal = button("揭晓释义", () => {
      const answer = document.createElement("p");
      answer.className = "answer";
      answer.textContent = card.meaning;
      reveal.replaceWith(answer,
        button("记得", () => { queue.shift(); showNext(); }),
        button("忘了", () => { queue.push(queue.shift()); showNext(); })
      );
    });
    panel.append(hint, prompt, reveal);
  }

  if (queue.length) showNext();
  else panel.textContent = "还没有这一类收藏。";
}
