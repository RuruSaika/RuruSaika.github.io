const { apiUrl, escapeHtml, renderMarkdown, formatDate } = window.StudyBoard;
const articleRoot = document.querySelector("[data-article]");
const slug = new URLSearchParams(location.search).get("slug");

async function loadPost() {
  if (!slug) return showError("缺少文章地址。", "返回学习记录板重新选择一篇记录吧。");
  try {
    const response = await fetch(apiUrl(`/api/study/posts/${encodeURIComponent(slug)}`));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "没有找到这篇记录");
    const post = data.post;
    document.title = `${post.title} — Study Log`;
    articleRoot.innerHTML = `
      <header class="article-header">
        <div class="article-info"><span class="subject-badge">${escapeHtml(post.subject)}</span><span>${formatDate(post.publishedAt, true)}</span><span>REV. ${post.revision || 1}</span></div>
        <h1>${escapeHtml(post.title)}</h1>
        ${post.summary ? `<p class="summary">${escapeHtml(post.summary)}</p>` : ""}
        <div class="hero-meta">${(post.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </header>
      <article class="article-body">${renderMarkdown(post.content)}</article>
    `;
  } catch (error) {
    showError("这页笔记暂时打不开", error.message || "请稍后再试。");
  }
}

function showError(title, message) {
  articleRoot.innerHTML = `<div class="article-error"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="./">返回学习记录板</a></p></div></div>`;
}

loadPost();
