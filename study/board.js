const { apiUrl, escapeHtml, formatDate } = window.StudyBoard;
const postsRoot = document.querySelector("[data-posts]");
const countRoot = document.querySelector("[data-count]");
const searchInput = document.querySelector("[data-search]");
const filterRoot = document.querySelector("[data-filters]");
let allPosts = [];
let activeSubject = "全部";

document.querySelector("[data-year]").textContent = new Date().getFullYear();

async function loadPosts() {
  try {
    const response = await fetch(apiUrl("/api/study/posts"));
    if (!response.ok) throw new Error("load failed");
    const data = await response.json();
    allPosts = data.posts || [];
    renderPosts();
  } catch {
    postsRoot.innerHTML = `<div class="empty-board"><div><strong>书桌暂时没有连接上</strong><p>学习记录服务可能正在更新，请稍后再来看看。</p></div></div>`;
    countRoot.textContent = "OFFLINE";
  }
}

function renderPosts() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allPosts.filter((post) => {
    const matchesSubject = activeSubject === "全部" || post.subject === activeSubject;
    const haystack = [post.title, post.summary, post.subject, ...(post.tags || [])].join(" ").toLowerCase();
    return matchesSubject && (!query || haystack.includes(query));
  });

  countRoot.textContent = `${String(filtered.length).padStart(2, "0")} RECORDS`;
  if (!filtered.length) {
    postsRoot.innerHTML = `<div class="empty-board"><div><strong>${allPosts.length ? "没有找到匹配的记录" : "第一篇记录正在路上"}</strong><p>${allPosts.length ? "换个关键词或科目试试。" : "这里会慢慢积累思考、错题与复盘。"}</p></div></div>`;
    return;
  }

  postsRoot.innerHTML = filtered.map((post) => `
    <a class="post-card" href="post.html?slug=${encodeURIComponent(post.slug)}">
      <div class="post-card-meta"><span class="subject-badge">${escapeHtml(post.subject)}</span><span>${formatDate(post.publishedAt)}</span></div>
      <h3>${escapeHtml(post.title)}</h3>
      <p>${escapeHtml(post.summary || "这篇记录暂时没有摘要。")}</p>
      <div class="post-card-bottom">
        <div class="post-tags">${(post.tags || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <span class="post-arrow" aria-hidden="true">↗</span>
      </div>
    </a>
  `).join("");
}

searchInput.addEventListener("input", renderPosts);
filterRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-subject]");
  if (!button) return;
  activeSubject = button.dataset.subject;
  filterRoot.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderPosts();
});

loadPosts();
