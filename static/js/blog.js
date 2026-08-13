(() => {
    const board = window.StudyBoard;
    const section = document.querySelector("[data-blog-section]");
    if (!board || !section) return;

    const indexView = section.querySelector("[data-blog-index]");
    const intro = section.querySelector("[data-blog-intro]");
    const reader = section.querySelector("[data-blog-reader]");
    const articleRoot = section.querySelector("[data-blog-article]");
    const postsRoot = section.querySelector("[data-blog-posts]");
    const countRoot = section.querySelector("[data-blog-count]");
    const searchInput = section.querySelector("[data-blog-search]");
    const filterRoot = section.querySelector("[data-blog-filters]");
    const pagination = section.querySelector("[data-blog-pagination]");
    const backButton = section.querySelector("[data-blog-back]");
    const defaultTitle = document.title;
    const POSTS_PER_PAGE = 4;
    const state = { posts: [], category: "全部", homepageSort: "updated_at", page: 1, loaded: false, currentTitle: null };
    let cleanupOutlineTracking = () => {};

    function postHref(title) {
        const url = new URL(location.href);
        url.search = "";
        url.searchParams.set("post", title);
        url.hash = "blog";
        return `${url.pathname}${url.search}${url.hash}`;
    }

    function listHref() {
        const url = new URL(location.href);
        url.search = "";
        url.hash = "blog";
        return `${url.pathname}${url.hash}`;
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
            <a class="blog-card" href="${postHref(post.title)}" data-blog-post-link="${board.escapeHtml(post.title)}">
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
        if (state.loaded) return;
        try {
            const source = board.isSitesHost ? board.apiUrl("/api/study/posts") : "/static/blog/posts.json";
            const response = await fetch(source, { cache: "no-store" });
            if (!response.ok) throw new Error("load failed");
            const data = await response.json();
            state.posts = data.posts || [];
            state.homepageSort = data.homepageSort === "published_at" ? "published_at" : "updated_at";
            state.loaded = true;
            renderPosts();
        } catch {
            postsRoot.innerHTML = '<div class="blog-empty"><strong>Blog 暂时没有连接上</strong><p>文章服务可能正在更新，请稍后再来看看。</p></div>';
            countRoot.textContent = "OFFLINE";
        }
    }

    function showIndex() {
        cleanupOutlineTracking();
        state.currentTitle = null;
        reader.hidden = true;
        indexView.hidden = false;
        intro.hidden = false;
        section.classList.remove("blog-reading");
        document.title = defaultTitle;
    }

    async function showArticle(title) {
        indexView.hidden = true;
        intro.hidden = true;
        reader.hidden = false;
        section.classList.add("blog-reading");
        articleRoot.innerHTML = '<div class="blog-article-state">正在打开文章……</div>';

        try {
            let post;
            if (board.isSitesHost) {
                const response = await fetch(board.apiUrl(`/api/study/posts/${encodeURIComponent(title)}`));
                const data = await response.json();
                if (!response.ok || !data.post) throw new Error(data.error || "没有找到这篇文章。");
                post = data.post;
            } else {
                if (!state.loaded) await loadPosts();
                post = state.posts.find((item) => item.title === title);
                if (!post) throw new Error("没有找到这篇文章。");
            }
            document.title = `${post.title} — RuruSaika`;
            const markdownDocument = board.renderMarkdownDocument(post.content);
            const outlineHtml = board.renderOutline(markdownDocument.outline);
            articleRoot.innerHTML = `
                <header class="blog-article-header">
                    <div class="blog-article-info"><span>${board.escapeHtml(post.subject)}</span><time>发布 ${board.formatDate(post.publishedAt, true)}</time><time>修改 ${board.formatDate(post.updatedAt || post.publishedAt, true)}</time></div>
                    <h2>${board.escapeHtml(post.title)}</h2>
                    ${post.summary ? `<p>${board.escapeHtml(post.summary)}</p>` : ""}
                </header>
                <div class="blog-article-layout${outlineHtml ? " has-outline" : ""}">
                    ${outlineHtml ? `<aside class="blog-article-outline">${outlineHtml}</aside>` : ""}
                    <div class="blog-article-body">${markdownDocument.html}<div class="blog-article-reserve" aria-hidden="true"></div></div>
                </div>
            `;
            const outlineSidebar = articleRoot.querySelector(".blog-article-outline");
            if (outlineSidebar) outlineSidebar.prepend(backButton);
            else reader.insertBefore(backButton, articleRoot);
            board.renderLatex(articleRoot.querySelector(".blog-article-body"));
            cleanupOutlineTracking();
            cleanupOutlineTracking = board.bindOutlineTracking(articleRoot);
            state.currentTitle = post.title;
        } catch (error) {
            cleanupOutlineTracking();
            state.currentTitle = null;
            reader.insertBefore(backButton, articleRoot);
            articleRoot.innerHTML = `<div class="blog-article-state"><strong>文章暂时无法打开</strong><p>${board.escapeHtml(error.message || "请稍后重试。")}</p></div>`;
        }
    }

    async function syncRoute({ scroll = false } = {}) {
        const title = new URL(location.href).searchParams.get("post");
        const articleChanged = Boolean(title && state.currentTitle !== title);
        if (articleChanged) await showArticle(title);
        else if (!title) showIndex();
        const fragment = location.hash.slice(1);
        if (articleChanged && title && fragment && fragment !== "blog") {
            let targetId = fragment;
            try { targetId = decodeURIComponent(fragment); } catch {}
            document.getElementById(targetId)?.scrollIntoView({ block: "start" });
        } else if (scroll) section.scrollIntoView({ behavior: "smooth", block: "start" });
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
    postsRoot.addEventListener("click", (event) => {
        const link = event.target.closest("[data-blog-post-link]");
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        history.pushState({ blogPost: link.dataset.blogPostLink }, "", link.href);
        syncRoute({ scroll: true });
    });
    backButton.addEventListener("click", () => {
        history.pushState({ blogIndex: true }, "", listHref());
        syncRoute({ scroll: true });
    });
    window.addEventListener("popstate", () => syncRoute());

    async function init() {
        await loadPosts();
        await syncRoute();
    }

    init();
})();
