const { SITES_ORIGIN, apiUrl, escapeHtml, setThemeFavicon, renderMarkdownDocument, renderOutline, bindOutlineTracking, renderLatex, adjustMarkdownIndent, formatDate, isSitesHost, isLocal } = window.StudyBoard;

const adminRoot = document.documentElement;
const adminThemeButton = document.querySelector("[data-admin-theme-toggle]");
const adminThemeLabel = document.querySelector("[data-admin-theme-label]");
const adminThemeColor = document.querySelector('meta[name="theme-color"]');

function readAdminTheme() {
  try { return localStorage.getItem("ruru-theme"); } catch { return null; }
}

function applyAdminTheme(theme, persist = true) {
  const isLight = theme === "light";
  adminRoot.dataset.theme = isLight ? "light" : "dark";
  adminThemeLabel.textContent = isLight ? "深色" : "浅色";
  adminThemeButton.setAttribute("aria-label", `切换为${isLight ? "深色" : "浅色"}主题`);
  adminThemeColor.setAttribute("content", isLight ? "#e9ecef" : "#101010");
  setThemeFavicon(isLight ? "light" : "dark");
  if (persist) {
    try { localStorage.setItem("ruru-theme", isLight ? "light" : "dark"); } catch { /* Theme still works without storage. */ }
  }
}

const adminBrowserTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
applyAdminTheme(readAdminTheme() || adminBrowserTheme, false);
adminThemeButton.addEventListener("click", () => applyAdminTheme(adminRoot.dataset.theme === "light" ? "dark" : "light"));

if (!isSitesHost && !isLocal) {
  location.replace(`${SITES_ORIGIN}/study/admin/`);
} else {
  initAdmin();
}

function initAdmin() {
  const MAX_POSTS_PER_PAGE = 7;
  const state = { posts: [], current: null, dirty: false, preview: false, fullscreen: false, saving: false, page: 1, pageSize: MAX_POSTS_PER_PAGE, homepageSort: "updated_at" };
  const $ = (selector) => document.querySelector(selector);
  const authScreen = $("[data-auth-screen]");
  const adminApp = $("[data-admin-app]");
  const form = $("[data-post-form]");
  const editorEmpty = $("[data-editor-empty]");
  const postList = $("[data-post-list]");
  const content = $("[data-content]");
  const preview = $("[data-preview]");
  const editor = $("[data-editor]");
  const fullscreenButton = $("[data-fullscreen-toggle]");
  const toastRoot = $("[data-toast]");
  let toastTimer;
  let cleanupOutlineTracking = () => {};
  let postListResizeFrame = 0;

  function setSaveState(message, mode = "saved") {
    const headerState = $("[data-save-state]");
    headerState.textContent = message;
    headerState.classList.toggle("dirty", mode === "dirty");
    headerState.classList.toggle("error", mode === "error");
    headerState.classList.toggle("saving", mode === "saving");
    $("[data-fullscreen-save-state-label]").textContent = message;
    $("[data-fullscreen-save-state]").dataset.state = mode;
  }

  async function boot() {
    const message = $("[data-auth-message]");
    const signIn = $("[data-sign-in]");
    const retry = $("[data-retry-auth]");
    message.textContent = "正在确认编辑身份…";
    signIn.hidden = true;
    retry.hidden = true;
    authScreen.hidden = false;
    adminApp.hidden = true;
    if (isLocal) {
      try {
        const response = await fetch("/static/blog/posts.json", { cache: "no-store" });
        const data = response.ok ? await response.json() : {};
        state.posts = (data.posts || []).map((post) => ({ ...post, status: "published" }));
        state.homepageSort = data.homepageSort === "published_at" ? "published_at" : "updated_at";
        $("[data-homepage-sort]").value = state.homepageSort;
      } catch { /* A missing snapshot should not block the local editor shell. */ }
      authScreen.hidden = true;
      adminApp.hidden = false;
      newPost();
      setSaveState("本地只读预览", "readonly");
      $("[data-export]").hidden = true;
      document.querySelector('a[href^="/signout-with-chatgpt"]')?.setAttribute("hidden", "");
      $("[data-save-draft]").disabled = true;
      $("[data-publish]").disabled = true;
      $("[data-homepage-sort]").disabled = true;
      $("[data-upload-zone]").setAttribute("aria-disabled", "true");
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      const response = await fetch(apiUrl("/api/study/admin/session"), {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const data = await response.json();
      if (!response.ok) {
        message.textContent = data.error || "需要登录后才能编辑。";
        if (response.status === 401) {
          signIn.href = data.signInPath || "/signin-with-chatgpt?return_to=%2Fstudy%2Fadmin%2F";
          signIn.hidden = false;
        } else {
          retry.hidden = false;
        }
        return;
      }
      $("[data-export]").href = apiUrl("/api/study/admin/export");
      await loadPosts();
      authScreen.hidden = true;
      adminApp.hidden = false;
    } catch (error) {
      message.textContent = error.name === "AbortError"
        ? "身份检查超时了，可能是网络短暂波动。"
        : "暂时无法连接编辑服务，请稍后重试。";
      retry.hidden = false;
    }
  }

  async function loadPosts(selectId) {
    const response = await fetch(apiUrl("/api/study/admin/posts"));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "文章加载失败");
    state.posts = data.posts || [];
    state.homepageSort = data.homepageSort === "published_at" ? "published_at" : "updated_at";
    $("[data-homepage-sort]").value = state.homepageSort;
    if (selectId) {
      const selectedIndex = getFilteredPosts().findIndex((post) => post.id === selectId);
      if (selectedIndex >= 0) state.page = Math.floor(selectedIndex / state.pageSize) + 1;
    }
    renderPostList();
    if (selectId) {
      const selected = state.posts.find((post) => post.id === selectId);
      if (selected) showPost(selected);
    }
  }

  function getFilteredPosts() {
    const query = $("[data-admin-search]").value.trim().toLowerCase();
    return state.posts
      .filter((post) => [post.title, post.summary, post.subject, ...(post.tags || [])].join(" ").toLowerCase().includes(query))
      .sort(compareAdminPosts);
  }

  function compareAdminPosts(left, right) {
    if (state.homepageSort === "published_at") {
      const leftPublished = left.publishedAt ? Date.parse(left.publishedAt) || 0 : null;
      const rightPublished = right.publishedAt ? Date.parse(right.publishedAt) || 0 : null;
      if (leftPublished === null && rightPublished !== null) return 1;
      if (leftPublished !== null && rightPublished === null) return -1;
      if (leftPublished !== rightPublished) return (rightPublished || 0) - (leftPublished || 0);
    }
    const updatedDifference = (Date.parse(right.updatedAt || right.publishedAt) || 0) - (Date.parse(left.updatedAt || left.publishedAt) || 0);
    if (updatedDifference) return updatedDifference;
    return String(left.id || "").localeCompare(String(right.id || ""));
  }

  function renderPostList() {
    const filtered = getFilteredPosts();
    const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const pagePosts = filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    const pagination = $("[data-post-pagination]");
    $("[data-post-total]").textContent = state.posts.length;
    pagination.hidden = filtered.length <= state.pageSize;
    $("[data-admin-page-status]").textContent = `${String(state.page).padStart(2, "0")} / ${String(pageCount).padStart(2, "0")}`;
    $("[data-admin-page=\"previous\"]").disabled = state.page === 1;
    $("[data-admin-page=\"next\"]").disabled = state.page === pageCount;
    if (!filtered.length) {
      postList.innerHTML = `<div class="post-list-empty">${state.posts.length ? "没有找到匹配的文章。" : "还没有文章。点击上方按钮，写下第一篇。"}</div>`;
      return;
    }
    const usesPublishedDate = state.homepageSort === "published_at";
    const statusPresentation = {
      published: { className: "published-badge", label: "已发布" },
      hidden: { className: "hidden-badge", label: "已隐藏" },
      draft: { className: "draft-badge", label: "草稿" },
    };
    postList.innerHTML = pagePosts.map((post) => `
      <article class="sidebar-post ${state.current?.id === post.id ? "active" : ""}" data-post-row data-post-id="${post.id}">
        <button class="sidebar-post-open" type="button" data-open-id="${post.id}">
          <div class="sidebar-post-meta"><span>${escapeHtml(post.subject)}</span><span class="${(statusPresentation[post.status] || statusPresentation.draft).className}">${(statusPresentation[post.status] || statusPresentation.draft).label}</span></div>
          <h3>${escapeHtml(post.title || "未命名文章")}</h3>
          <div class="sidebar-post-meta"><span>${usesPublishedDate
            ? (post.publishedAt ? `发布 ${formatDate(post.publishedAt)}` : "尚未发布")
            : `修改 ${formatDate(post.updatedAt)}`}</span></div>
        </button>
      </article>
    `).join("");
  }

  function fitPostListToAvailableHeight() {
    const firstCard = postList.querySelector(".sidebar-post");
    if (!firstCard || postList.clientHeight <= 0) return;
    const cardHeight = Math.max(1, firstCard.getBoundingClientRect().height);
    const nextPageSize = Math.max(1, Math.min(MAX_POSTS_PER_PAGE, Math.floor((postList.clientHeight + 1) / cardHeight)));
    if (nextPageSize === state.pageSize) return;
    const firstVisibleIndex = (state.page - 1) * state.pageSize;
    state.pageSize = nextPageSize;
    state.page = Math.floor(firstVisibleIndex / state.pageSize) + 1;
    renderPostList();
  }

  function changePostPage(direction) {
    const pageCount = Math.max(1, Math.ceil(getFilteredPosts().length / state.pageSize));
    const nextPage = Math.min(pageCount, Math.max(1, state.page + direction));
    if (nextPage === state.page) return;
    state.page = nextPage;
    renderPostList();
    postList.querySelector("[data-open-id]")?.focus({ preventScroll: true });
  }

  async function saveHomepageSort(value) {
    const select = $("[data-homepage-sort]");
    select.disabled = true;
    setSaveState("正在保存主页排序…", "saving");
    try {
      const response = await fetch(apiUrl("/api/study/admin/settings/homepage-sort"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "主页排序保存失败");
      state.homepageSort = data.homepageSort;
      const selectedIndex = state.current?.id ? getFilteredPosts().findIndex((post) => post.id === state.current.id) : -1;
      state.page = selectedIndex >= 0 ? Math.floor(selectedIndex / state.pageSize) + 1 : 1;
      renderPostList();
      setSaveState(state.dirty ? "有尚未保存的修改" : "主页排序已保存", state.dirty ? "dirty" : "saved");
      toast(data.sync?.queued === false ? "主页排序已保存；GitHub 镜像将稍后重试。" : "主页排序已保存，GitHub 镜像正在更新。", data.sync?.queued === false);
    } catch (error) {
      select.value = state.homepageSort;
      setSaveState("主页排序保存失败", "error");
      toast(error.message || "主页排序保存失败，请重试。", true);
    } finally {
      select.disabled = false;
    }
  }

  function newPost() {
    if (!confirmDiscard()) return;
    state.current = { id: "", status: "draft", subject: "生活", tags: [] };
    fillForm(state.current);
    form.hidden = false;
    editorEmpty.hidden = true;
    $("[data-hide]").hidden = true;
    $("[data-delete]").hidden = true;
    markDirty(false);
    $("[data-title]").focus();
    renderPostList();
  }

  function openPost(post) {
    if (state.current?.id === post.id) return;
    if (!confirmDiscard()) return;
    showPost(post);
  }

  function showPost(post) {
    state.current = { ...post };
    fillForm(post);
    form.hidden = false;
    editorEmpty.hidden = true;
    $("[data-hide]").hidden = post.status === "hidden";
    $("[data-delete]").hidden = false;
    markDirty(false);
    renderPostList();
  }

  function fillForm(post) {
    $("[data-id]").value = post.id || "";
    $("[data-title]").value = post.title || "";
    $("[data-summary]").value = post.summary || "";
    content.value = post.content || "";
    requestAnimationFrame(resizeContentEditor);
    $("[data-subject]").value = post.subject || "其它";
    $("[data-tags]").value = (post.tags || []).join("，");
    $("[data-status-label]").textContent = post.status === "published"
      ? `已发布 · ${formatDate(post.publishedAt)}`
      : post.status === "hidden" ? "已隐藏" : post.id ? "草稿" : "新草稿";
    $(".status-dot").classList.toggle("published", post.status === "published");
    $("[data-publish]").textContent = post.status === "published" ? "更新发布" : "发布文章";
    renderPreview();
    setPreview(false);
  }

  function renderPreview() {
    cleanupOutlineTracking();
    const document = renderMarkdownDocument(content.value);
    const outlineHtml = renderOutline(document.outline);
    preview.innerHTML = document.html
      ? `<div class="preview-document${outlineHtml ? " has-outline" : ""}">${outlineHtml ? `<aside class="preview-outline">${outlineHtml}</aside>` : ""}<div class="preview-body">${document.html}<div class="blog-article-reserve" aria-hidden="true"></div></div>`
      : "<p>还没有正文内容。</p>";
    renderLatex(preview);
    requestAnimationFrame(() => {
      if (!preview.hidden) cleanupOutlineTracking = bindOutlineTracking(preview, getEditorScrollContainer());
    });
  }

  function collectPayload(status) {
    return {
      id: $("[data-id]").value || undefined,
      title: $("[data-title]").value.trim(),
      summary: $("[data-summary]").value.trim(),
      content: content.value,
      subject: $("[data-subject]").value,
      tags: $("[data-tags]").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      status,
    };
  }

  async function save(status) {
    if (state.saving) return;
    const payload = collectPayload(status);
    if (!payload.title) { toast("请先填写标题。", true); $("[data-title]").focus(); return; }
    state.saving = true;
    setSaveState("正在保存…", "saving");
    try {
      const response = await fetch(apiUrl("/api/study/admin/posts"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      state.current = data.post;
      localStorage.removeItem("ruru-study-unsaved");
      markDirty(false);
      await loadPosts(data.post.id);
      if (status === "published" && data.sync?.queued === false) {
        toast("文章已发布，但 GitHub 镜像未能启动；定时任务将稍后重试。", true);
      } else {
        toast(status === "published" ? "文章已发布，GitHub 镜像正在更新。" : "草稿已保存。");
      }
    } catch (error) {
      setSaveState("保存失败", "error");
      toast(error.message || "保存失败，请稍后重试。", true);
    } finally {
      state.saving = false;
    }
  }

  async function hideCurrent() {
    if (!state.current?.id) return;
    if (!confirm(`确定隐藏“${state.current.title}”吗？它不会显示在个人主页，但仍会保留在编辑台。`)) return;
    const response = await fetch(apiUrl(`/api/study/admin/posts/${state.current.id}/hide`), { method: "POST" });
    const data = await response.json();
    if (!response.ok) return toast(data.error || "隐藏失败。", true);
    state.current = data.post;
    markDirty(false);
    await loadPosts(state.current.id);
    toast(data.sync?.queued === false && data.sync?.reason !== "not_public"
      ? "文章已隐藏，但 GitHub 镜像未能启动；定时任务将稍后重试。"
      : "文章已隐藏，仍可在编辑台中查看。", data.sync?.queued === false && data.sync?.reason !== "not_public");
  }

  async function deleteCurrent() {
    if (!state.current?.id) return;
    const title = state.current.title || "未命名文章";
    if (!confirm(`确定永久删除“${title}”吗？\n\n文章正文和关联图片都会被移除，删除后无法恢复。`)) return;
    if (prompt("这是最后一次确认。请输入“永久删除”继续：") !== "永久删除") {
      toast("已取消永久删除。");
      return;
    }
    const response = await fetch(apiUrl(`/api/study/admin/posts/${state.current.id}`), { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return toast(data.error || "永久删除失败。", true);
    state.current = null;
    setFullscreen(false);
    form.hidden = true;
    editorEmpty.hidden = false;
    localStorage.removeItem("ruru-study-unsaved");
    markDirty(false);
    await loadPosts();
    toast(data.deletedAssets ? `文章已永久删除，同时清理了 ${data.deletedAssets} 张图片。` : "文章已永久删除。");
  }

  function markDirty(dirty = true) {
    state.dirty = dirty;
    setSaveState(dirty ? "有尚未保存的修改" : "所有修改均已保存", dirty ? "dirty" : "saved");
    if (dirty) {
      localStorage.setItem("ruru-study-unsaved", JSON.stringify({ ...collectPayload(state.current?.status || "draft"), savedAt: Date.now() }));
    }
  }

  function confirmDiscard() {
    return !state.dirty || confirm("当前有尚未保存的修改，确定离开吗？");
  }

  function getEditorScrollContainer() {
    const editorScroll = $(".editor-scroll");
    const overflow = getComputedStyle(editorScroll).overflowY;
    return ["auto", "scroll"].includes(overflow) ? editorScroll : document.scrollingElement;
  }

  function readElementTop(element, scrollContainer) {
    const containerTop = scrollContainer === document.scrollingElement
      ? 0
      : scrollContainer.getBoundingClientRect().top;
    return element.getBoundingClientRect().top - containerTop + scrollContainer.scrollTop;
  }

  function resizeContentEditor() {
    if (content.hidden) return;
    const scrollContainer = getEditorScrollContainer();
    const scrollPosition = scrollContainer.scrollTop;
    content.style.height = "auto";
    content.style.height = String(Math.max(360, content.scrollHeight)) + "px";
    scrollContainer.scrollTop = scrollPosition;
  }

  function readDocumentPosition(element, scrollContainer) {
    const elementTop = readElementTop(element, scrollContainer);
    if (scrollContainer.scrollTop <= elementTop) return { absolute: scrollContainer.scrollTop };
    const maximum = Math.max(1, element.scrollHeight - scrollContainer.clientHeight);
    const progress = Math.min(1, Math.max(0, (scrollContainer.scrollTop - elementTop) / maximum));
    return { progress };
  }

  function restoreDocumentPosition(element, position, scrollContainer) {
    const restore = () => {
      if (position.absolute !== undefined) {
        scrollContainer.scrollTop = position.absolute;
        return;
      }
      const elementTop = readElementTop(element, scrollContainer);
      const maximum = Math.max(0, element.scrollHeight - scrollContainer.clientHeight);
      scrollContainer.scrollTop = elementTop + maximum * position.progress;
    };
    restore();
    requestAnimationFrame(() => requestAnimationFrame(restore));
  }

  function setPreview(next) {
    if (state.preview === next) {
      preview.hidden = !next;
      content.hidden = next;
      $("[data-preview-toggle]").textContent = next ? "继续编辑" : "预览";
      if (!next) {
        cleanupOutlineTracking();
        requestAnimationFrame(resizeContentEditor);
      }
      return;
    }

    const currentView = state.preview ? preview : content;
    const editorScroll = getEditorScrollContainer();
    const documentPosition = readDocumentPosition(currentView, editorScroll);

    if (next) {
      preview.style.removeProperty("height");
      renderPreview();
    }

    state.preview = next;
    preview.hidden = !next;
    content.hidden = next;
    $("[data-preview-toggle]").textContent = next ? "继续编辑" : "预览";
    if (!next) {
      cleanupOutlineTracking();
      resizeContentEditor();
    }
    restoreDocumentPosition(next ? preview : content, documentPosition, editorScroll);
  }

  function setFullscreen(next) {
    state.fullscreen = next;
    editor.classList.toggle("editor-fullscreen", next);
    document.body.classList.toggle("editor-is-fullscreen", next);
    fullscreenButton.textContent = next ? "退出全屏" : "全屏编辑";
    fullscreenButton.setAttribute("aria-pressed", String(next));
    if (next && !state.preview) content.focus();
  }

  function insertAtCursor(before, after = "") {
    const start = content.selectionStart;
    const end = content.selectionEnd;
    const selected = content.value.slice(start, end);
    content.setRangeText(`${before}${selected}${after}`, start, end, "end");
    resizeContentEditor();
    content.focus();
    markDirty();
  }

  async function uploadFiles(files) {
    if (isLocal) return;
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    const uploadState = $("[data-upload-state]");
    for (let index = 0; index < images.length; index += 1) {
      const file = images[index];
      uploadState.textContent = `上传中 ${index + 1}/${images.length}`;
      const body = new FormData();
      body.append("file", file);
      if (state.current?.id) body.append("postId", state.current.id);
      body.append("alt", file.name.replace(/\.[^.]+$/, ""));
      try {
        const response = await fetch(apiUrl("/api/study/admin/upload"), { method: "POST", body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "图片上传失败");
        const alt = file.name.replace(/\.[^.]+$/, "") || "文章图片";
        insertAtCursor(`\n![${alt}](${data.asset.token})\n`);
      } catch (error) {
        toast(error.message || "图片上传失败。", true);
      }
    }
    uploadState.textContent = "上传完成";
    window.setTimeout(() => { uploadState.textContent = "JPG / PNG / WEBP / GIF"; }, 1800);
  }

  function toast(message, error = false) {
    window.clearTimeout(toastTimer);
    toastRoot.textContent = message;
    toastRoot.classList.toggle("error", error);
    toastRoot.classList.add("show");
    toastTimer = window.setTimeout(() => toastRoot.classList.remove("show"), 3000);
  }

  postList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-id]");
    if (button) openPost(state.posts.find((post) => post.id === button.dataset.openId));
  });
  const previousPageButton = $("[data-admin-page=\"previous\"]");
  const nextPageButton = $("[data-admin-page=\"next\"]");
  previousPageButton.onclick = (event) => { event.preventDefault(); changePostPage(-1); };
  nextPageButton.onclick = (event) => { event.preventDefault(); changePostPage(1); };
  previousPageButton.onkeydown = (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    changePostPage(-1);
  };
  nextPageButton.onkeydown = (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    changePostPage(1);
  };
  new ResizeObserver(() => {
    window.cancelAnimationFrame(postListResizeFrame);
    postListResizeFrame = window.requestAnimationFrame(fitPostListToAvailableHeight);
  }).observe(postList);
  $("[data-new-post]").addEventListener("click", newPost);
  $("[data-empty-new]").addEventListener("click", newPost);
  $("[data-retry-auth]").addEventListener("click", boot);
  $("[data-admin-search]").addEventListener("input", () => { state.page = 1; renderPostList(); });
  $("[data-homepage-sort]").addEventListener("change", (event) => saveHomepageSort(event.target.value));
  form.addEventListener("input", () => markDirty());
  content.addEventListener("input", resizeContentEditor);
  content.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const adjusted = adjustMarkdownIndent(content.value, content.selectionStart, content.selectionEnd, event.shiftKey);
    content.value = adjusted.value;
    content.setSelectionRange(adjusted.selectionStart, adjusted.selectionEnd);
    resizeContentEditor();
    markDirty();
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); save("published"); });
  $("[data-save-draft]").addEventListener("click", () => save("draft"));
  $("[data-preview-toggle]").addEventListener("click", () => setPreview(!state.preview));
  fullscreenButton.addEventListener("click", () => setFullscreen(!state.fullscreen));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.fullscreen) setFullscreen(false);
  });
  $("[data-hide]").addEventListener("click", hideCurrent);
  $("[data-delete]").addEventListener("click", deleteCurrent);

  const uploadZone = $("[data-upload-zone]");
  const fileInput = $("[data-file-input]");
  uploadZone.addEventListener("click", () => { if (!isLocal) fileInput.click(); });
  uploadZone.addEventListener("keydown", (event) => { if (!isLocal && ["Enter", " "].includes(event.key)) { event.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener("change", () => { uploadFiles(fileInput.files); fileInput.value = ""; });
  uploadZone.addEventListener("dragover", (event) => { event.preventDefault(); uploadZone.classList.add("dragging"); });
  uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragging"));
  uploadZone.addEventListener("drop", (event) => { event.preventDefault(); uploadZone.classList.remove("dragging"); uploadFiles(event.dataTransfer.files); });
  content.addEventListener("paste", (event) => {
    const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
    if (files.length) { event.preventDefault(); uploadFiles(files); }
  });
  window.addEventListener("beforeunload", (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ""; } });

  boot();
}
