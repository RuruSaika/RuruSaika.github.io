(() => {
    const board = window.StudyBoard;
    const reader = document.querySelector("[data-blog-reader]");
    const articleRoot = document.querySelector("[data-blog-article]");
    if (!board || !reader || !articleRoot) return;

    class MissingPostError extends Error {}

    async function loadPost(title) {
        if (board.isSitesHost) {
            const response = await fetch(board.apiUrl(`/api/study/posts/${encodeURIComponent(title)}`), { cache: "no-store" });
            if (response.status === 404) throw new MissingPostError();
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "文章服务暂时不可用。");
            if (!data.post) throw new MissingPostError();
            return data.post;
        }

        const response = await fetch("/static/blog/posts.json", { cache: "no-store" });
        if (!response.ok) throw new Error("文章服务暂时不可用。");
        const data = await response.json();
        const post = (data.posts || []).find((item) => item.title === title);
        if (!post) throw new MissingPostError();
        return post;
    }

    function renderMissing() {
        document.title = "链接无效或文章已被删除 — RuruSaika";
        articleRoot.innerHTML = `
            <section class="blog-missing" aria-labelledby="missing-title">
                <h1 id="missing-title">链接无效或文章已被删除</h1>
            </section>
        `;
    }

    function scrollToFragment() {
        const fragment = location.hash.slice(1);
        if (!fragment) return;
        let targetId = fragment;
        try { targetId = decodeURIComponent(fragment); } catch {}
        document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    }

    async function init() {
        const title = new URL(location.href).searchParams.get("post")?.trim();
        if (!title) {
            renderMissing();
            return;
        }

        try {
            const post = await loadPost(title);
            document.title = `${post.title} — RuruSaika`;
            const markdownDocument = board.renderMarkdownDocument(post.content);
            const outlineHtml = board.renderOutline(markdownDocument.outline);
            articleRoot.innerHTML = `
                <header class="blog-article-header">
                    <div class="blog-article-info"><span>${board.escapeHtml(post.subject)}</span><time>发布 ${board.formatDate(post.publishedAt, true)}</time><time>修改 ${board.formatDate(post.updatedAt || post.publishedAt, true)}</time></div>
                    <h1>${board.escapeHtml(post.title)}</h1>
                    ${post.summary ? `<p>${board.escapeHtml(post.summary)}</p>` : ""}
                </header>
                <div class="blog-article-layout${outlineHtml ? " has-outline" : ""}">
                    ${outlineHtml ? `<aside class="blog-article-outline">${outlineHtml}</aside>` : ""}
                    <div class="blog-article-body">${markdownDocument.html}<div class="blog-article-reserve" aria-hidden="true"></div></div>
                </div>
            `;
            board.renderLatex(articleRoot.querySelector(".blog-article-body"));
            board.bindOutlineTracking(articleRoot);
            requestAnimationFrame(scrollToFragment);
        } catch (error) {
            if (error instanceof MissingPostError) {
                renderMissing();
                return;
            }
            articleRoot.innerHTML = '<div class="blog-article-state"><strong>文章暂时无法打开</strong><p>请稍后重试。</p></div>';
        }
    }

    init();
})();
