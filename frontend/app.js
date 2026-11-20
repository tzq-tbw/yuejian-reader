import {openReader} from "./reader.js";
import {openReview} from "./review.js";

const form = document.querySelector("#entry");
const statusLine = document.querySelector("#status");
const library = document.querySelector("#library");
const pdf = document.querySelector("#pdf");

async function request(path, method = "GET", data) {
  const blob = data instanceof Blob;
  const options = {method};
  if (data !== undefined) {
    options.headers = {"Content-Type": blob ? "application/pdf" : "application/json"};
    options.body = blob ? data : JSON.stringify(data);
  }
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(typeof result.detail === "string" ? result.detail : "请求失败，请检查输入内容。");
  }
  return result;
}

function showPage(id) {
  for (const page of document.querySelectorAll("[data-page]")) page.hidden = page.id !== id;
}

function readArticle(article) {
  showPage("reader");
  openReader(article, request, updated => {
    readArticle(updated);
    document.querySelector("#reader-status").textContent = "正文已保存。";
    loadArticles().catch(error => { statusLine.textContent = error.message; });
  });
}

async function loadArticles() {
  const articles = await request("/api/articles");
  library.replaceChildren();
  if (!articles.length) library.textContent = "还没有文章。导入试卷或粘贴一篇英文开始。";
  for (const article of articles) {
    const card = document.createElement("button");
    card.className = "article-card";
    const title = document.createElement("strong");
    title.textContent = article.title;
    const preview = document.createElement("span");
    preview.textContent = article.body.slice(0, 115);
    card.append(title, preview);
    card.onclick = () => readArticle(article);
    library.append(card);
  }
}

async function saveAndRefresh(button, action) {
  button.disabled = true;
  try {
    statusLine.textContent = await action();
    try {
      await loadArticles();
    } catch {
      statusLine.textContent += " 列表读取失败，请刷新页面。";
    }
  } catch (error) {
    statusLine.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

form.onsubmit = event => {
  event.preventDefault();
  saveAndRefresh(form.querySelector("button"), async () => {
    await request("/api/articles", "POST", Object.fromEntries(new FormData(form)));
    form.reset();
    return "文章已保存。";
  });
};

pdf.onsubmit = event => {
  event.preventDefault();
  saveAndRefresh(pdf.querySelector("button"), async () => {
    const {count} = await request("/api/import/pdf", "POST", pdf.elements.file.files[0]);
    pdf.reset();
    return "已导入 " + count + " 篇文章。";
  });
};

document.querySelector("#show-library").onclick = () => showPage("home");
for (const control of document.querySelectorAll("[data-review]")) {
  control.onclick = () => {
    showPage("review");
    openReview(control.dataset.review, request);
  };
}
loadArticles().catch(error => { statusLine.textContent = error.message; });
