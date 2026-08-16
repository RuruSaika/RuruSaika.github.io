(() => {
    const board = window.StudyBoard;
    const section = document.querySelector("[data-blog-section]");
    if (!board || !section) return;

    const postsRoot = section.querySelector("[data-blog-posts]");
    const countRoot = section.querySelector("[data-blog-count]");
    const searchInput = section.querySelector("[data-blog-search]");
    const filterRoot = section.querySelector("[data-blog-filters]");
    const pagination = section.querySelector("[data-blog-pagination]");
    const POSTS_PER_PAGE = 4;
    const state = { posts: [], category: "全部", homepageSort: "updated_at", page: 1 };

    function postHref(title) {
        const url = new URL("/blog/", location.origin);
        url.searchParams.set("post", title);
        return `${url.pathname}${url.search}`;
    }

    function comparePosts(a, b) {
        const field = state.homepageSort === "published_at" ? "publishedAt" : "updatedAt";
        const primaryDifference = new Date(b[field] || 0).getTime() - new Date(a[field] || 0).getTime();
        return primaryDifference || new Date(b.updatedAt || b.publishedAt || 0).getTime() - new Date(a.updatedAt || a.publishedAt || 0).getTime();
    }

    function renderPosts() {
        const query = searchInput.value.trim().toLowerCase();
        const filtered = state.posts.filter((post) => {
            const categoryMatch = state.category === "全部" || post.subject === state.category;
            const haystack = [post.title, post.summary, post.subject, ...(post.tags || [])].join(" ").toLowerCase();
            return categoryMatch && (!query || haystack.includes(query));
        }).sort(comparePosts);
        const pageCount = Math.max(1, Math.ceil(filtered.length / POSTS_PER_PAGE));
        state.page = Math.min(Math.max(1, state.page), pageCount);
        const pagePosts = filtered.slice((state.page - 1) * POSTS_PER_PAGE, state.page * POSTS_PER_PAGE);

        countRoot.textContent = `${String(filtered.length).padStart(2, "0")} ARTICLES`;
        pagination.hidden = filtered.length <= POSTS_PER_PAGE;
        section.querySelector("[data-blog-page-status]").textContent = `${String(state.page).padStart(2, "0")} / ${String(pageCount).padStart(2, "0")}`;
        section.querySelector('[data-blog-page="previous"]').disabled = state.page === 1;
        section.querySelector('[data-blog-page="next"]').disabled = state.page === pageCount;
        if (!filtered.length) {
            const hasPosts = state.posts.length > 0;
            postsRoot.innerHTML = `<div class="blog-empty"><strong>${hasPosts ? "没有找到匹配的文章" : "暂无文章"}</strong><p>${hasPosts ? "换个关键词或分类试试。" : "文章发布后会显示在这里。"}</p></div>`;
            return;
        }

        const dateField = state.homepageSort === "published_at" ? "publishedAt" : "updatedAt";
        postsRoot.innerHTML = pagePosts.map((post) => `
            <a class="blog-card" href="${postHref(post.title)}">
                <time class="blog-date">${board.formatDate(post[dateField] || post.updatedAt || post.publishedAt)}</time>
                <div class="blog-card-content">
                    <span class="blog-subject">${board.escapeHtml(post.subject)}</span>
                    <h3>${board.escapeHtml(post.title)}</h3>
                    ${String(post.summary || "").trim() ? `<p>${board.escapeHtml(post.summary)}</p>` : ""}
                    ${(post.tags || []).length ? `<div class="blog-tags">${post.tags.slice(0, 4).map((tag) => `<span>${board.escapeHtml(tag)}</span>`).join("")}</div>` : ""}
                </div>
                <span class="blog-arrow" aria-hidden="true">↗</span>
            </a>
        `).join("");
    }

    async function loadPosts() {
        try {
            const source = board.isSitesHost ? board.apiUrl("/api/study/posts") : "/static/blog/posts.json";
            const response = await fetch(source, { cache: "no-store" });
            if (!response.ok) throw new Error("load failed");
            const data = await response.json();
            state.posts = data.posts || [];
            state.homepageSort = data.homepageSort === "published_at" ? "published_at" : "updated_at";
            renderPosts();
        } catch {
            postsRoot.innerHTML = '<div class="blog-empty"><strong>Blog 暂时没有连接上</strong><p>文章服务可能正在更新，请稍后再来看看。</p></div>';
            countRoot.textContent = "OFFLINE";
        }
    }

    searchInput.addEventListener("input", () => { state.page = 1; renderPosts(); });
    filterRoot.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        state.category = button.dataset.category;
        state.page = 1;
        filterRoot.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
        renderPosts();
    });
    pagination.addEventListener("click", (event) => {
        const button = event.target.closest("[data-blog-page]");
        if (!button || button.disabled) return;
        state.page += button.dataset.blogPage === "next" ? 1 : -1;
        renderPosts();
        section.querySelector(".blog-summary").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    loadPosts();
})();
