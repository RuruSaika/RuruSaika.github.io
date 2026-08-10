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
    const sortRoot = section.querySelector("[data-blog-sort]");
    const backButton = section.querySelector("[data-blog-back]");
    const defaultTitle = document.title;
    const state = { posts: [], category: "全部", sort: "manual", loaded: false };

    function postHref(slug) {
        const url = new URL(location.href);
        url.search = "";
        url.searchParams.set("post", slug);
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
        const dateDifference = new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
        if (state.sort === "date") return dateDifference;
        const aOrder = Number(a.sortOrder || 0);
        const bOrder = Number(b.sortOrder || 0);
        if (aOrder > 0 && bOrder > 0) return aOrder - bOrder || dateDifference;
        if (aOrder > 0 || bOrder > 0) return aOrder > 0 ? 1 : -1;
        return dateDifference;
    }

    function renderPosts() {
        const query = searchInput.value.trim().toLowerCase();
        const filtered = state.posts.filter((post) => {
            const categoryMatch = state.category === "全部" || post.subject === state.category;
            const haystack = [post.title, post.summary, post.subject, ...(post.tags || [])].join(" ").toLowerCase();
            return categoryMatch && (!query || haystack.includes(query));
        }).sort(comparePosts);

        countRoot.textContent = `${String(filtered.length).padStart(2, "0")} ARTICLES`;
        if (!filtered.length) {
            const hasPosts = state.posts.length > 0;
            postsRoot.innerHTML = `<div class="blog-empty"><strong>${hasPosts ? "没有找到匹配的文章" : "暂无文章"}</strong><p>${hasPosts ? "换个关键词或分类试试。" : "文章发布后会显示在这里。"}</p></div>`;
            return;
        }

        postsRoot.innerHTML = filtered.map((post) => `
            <a class="blog-card" href="${postHref(post.slug)}" data-blog-post-link="${board.escapeHtml(post.slug)}">
                <time class="blog-date">${board.formatDate(post.publishedAt)}</time>
                <div class="blog-card-content">
                    <span class="blog-subject">${board.escapeHtml(post.subject)}</span>
                    <h3>${board.escapeHtml(post.title)}</h3>
                    <p>${board.escapeHtml(post.summary || "这篇文章暂时没有摘要。")}</p>
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
            state.loaded = true;
            renderPosts();
        } catch {
            postsRoot.innerHTML = '<div class="blog-empty"><strong>Blog 暂时没有连接上</strong><p>文章服务可能正在更新，请稍后再来看看。</p></div>';
            countRoot.textContent = "OFFLINE";
        }
    }

    function showIndex() {
        reader.hidden = true;
        indexView.hidden = false;
        intro.hidden = false;
        section.classList.remove("blog-reading");
        document.title = defaultTitle;
    }

    async function showArticle(slug) {
        indexView.hidden = true;
        intro.hidden = true;
        reader.hidden = false;
        section.classList.add("blog-reading");
        articleRoot.innerHTML = '<div class="blog-article-state">正在打开文章……</div>';

        try {
            let post;
            if (board.isSitesHost) {
                const response = await fetch(board.apiUrl(`/api/study/posts/${encodeURIComponent(slug)}`));
                const data = await response.json();
                if (!response.ok || !data.post) throw new Error(data.error || "没有找到这篇文章。");
                post = data.post;
            } else {
                if (!state.loaded) await loadPosts();
                post = state.posts.find((item) => item.slug === slug);
                if (!post) throw new Error("没有找到这篇文章。");
            }
            document.title = `${post.title} — RuruSaika`;
            articleRoot.innerHTML = `
                <header class="blog-article-header">
                    <div class="blog-article-info"><span>${board.escapeHtml(post.subject)}</span><time>${board.formatDate(post.publishedAt, true)}</time><span>REV. ${post.revision || 1}</span></div>
                    <h2>${board.escapeHtml(post.title)}</h2>
                    ${post.summary ? `<p>${board.escapeHtml(post.summary)}</p>` : ""}
                </header>
                <div class="blog-article-body">${board.renderMarkdown(post.content)}</div>
            `;
        } catch (error) {
            articleRoot.innerHTML = `<div class="blog-article-state"><strong>文章暂时无法打开</strong><p>${board.escapeHtml(error.message || "请稍后重试。")}</p></div>`;
        }
    }

    async function syncRoute({ scroll = false } = {}) {
        const slug = new URL(location.href).searchParams.get("post");
        if (slug) await showArticle(slug);
        else showIndex();
        if (scroll) section.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    searchInput.addEventListener("input", renderPosts);
    filterRoot.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        state.category = button.dataset.category;
        filterRoot.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
        renderPosts();
    });
    sortRoot.addEventListener("click", (event) => {
        const button = event.target.closest("[data-sort-mode]");
        if (!button) return;
        state.sort = button.dataset.sortMode;
        sortRoot.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
        renderPosts();
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
