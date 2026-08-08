const { apiUrl, escapeHtml, formatDate } = window.StudyBoard;
const postsRoot = document.querySelector("[data-posts]");
const countRoot = document.querySelector("[data-count]");
const searchInput = document.querySelector("[data-search]");
const filterRoot = document.querySelector("[data-filters]");
const sortRoot = document.querySelector("[data-sort-switch]");
let allPosts = [];
let activeCategory = "全部";
let activeSort = "manual";

document.querySelector("[data-year]").textContent = new Date().getFullYear();

async function loadPosts() {
  try {
    const response = await fetch(apiUrl("/api/study/posts"));
    if (!response.ok) throw new Error("load failed");
    const data = await response.json();
    allPosts = data.posts || [];
    renderPosts();
  } catch {
    postsRoot.innerHTML = `<div class="empty-board"><div><strong>Blog 暂时没有连接上</strong><p>文章服务可能正在更新，请稍后再来看看。</p></div></div>`;
    countRoot.textContent = "OFFLINE";
  }
}

function renderPosts() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allPosts.filter((post) => {
    const matchesCategory = activeCategory === "全部" || post.subject === activeCategory;
    const haystack = [post.title, post.summary, post.subject, ...(post.tags || [])].join(" ").toLowerCase();
    return matchesCategory && (!query || haystack.includes(query));
  }).sort(comparePosts);

  countRoot.textContent = `${String(filtered.length).padStart(2, "0")} ARTICLES`;
  if (!filtered.length) {
    postsRoot.innerHTML = `<div class="empty-board"><div><strong>${allPosts.length ? "没有找到匹配的文章" : "第一篇文章正在路上"}</strong><p>${allPosts.length ? "换个关键词或分类试试。" : "这里会慢慢积累生活片段、学习记录与其它随笔。"}</p></div></div>`;
    return;
  }

  postsRoot.innerHTML = filtered.map((post) => `
    <a class="post-card" href="post.html?slug=${encodeURIComponent(post.slug)}">
      <div class="post-card-meta"><span class="subject-badge">${escapeHtml(post.subject)}</span><span>${formatDate(post.publishedAt)}</span></div>
      <h3>${escapeHtml(post.title)}</h3>
      <p>${escapeHtml(post.summary || "这篇文章暂时没有摘要。")}</p>
      <div class="post-card-bottom">
        <div class="post-tags">${(post.tags || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <span class="post-arrow" aria-hidden="true">↗</span>
      </div>
    </a>
  `).join("");
}

function comparePosts(a, b) {
  const dateDifference = new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
  if (activeSort === "date") return dateDifference;
  const aOrder = Number(a.sortOrder || 0);
  const bOrder = Number(b.sortOrder || 0);
  if (aOrder > 0 && bOrder > 0) return aOrder - bOrder || dateDifference;
  if (aOrder > 0 || bOrder > 0) return aOrder > 0 ? 1 : -1;
  return dateDifference;
}

searchInput.addEventListener("input", renderPosts);
filterRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  filterRoot.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderPosts();
});

sortRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort-mode]");
  if (!button) return;
  activeSort = button.dataset.sortMode;
  sortRoot.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderPosts();
});

loadPosts();
