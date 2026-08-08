const { SITES_ORIGIN, apiUrl, escapeHtml, renderMarkdown, formatDate, isSitesHost } = window.StudyBoard;

if (!isSitesHost) {
  location.replace(`${SITES_ORIGIN}/study/admin/`);
} else {
  initAdmin();
}

function initAdmin() {
  const state = { posts: [], current: null, dirty: false, preview: false, saving: false };
  const $ = (selector) => document.querySelector(selector);
  const authScreen = $("[data-auth-screen]");
  const adminApp = $("[data-admin-app]");
  const form = $("[data-post-form]");
  const editorEmpty = $("[data-editor-empty]");
  const postList = $("[data-post-list]");
  const content = $("[data-content]");
  const preview = $("[data-preview]");
  const toastRoot = $("[data-toast]");
  let toastTimer;

  async function boot() {
    const message = $("[data-auth-message]");
    const signIn = $("[data-sign-in]");
    const retry = $("[data-retry-auth]");
    message.textContent = "正在确认编辑身份…";
    signIn.hidden = true;
    retry.hidden = true;
    authScreen.hidden = false;
    adminApp.hidden = true;
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
    if (!response.ok) throw new Error(data.error || "记录加载失败");
    state.posts = data.posts || [];
    renderPostList();
    if (selectId) {
      const selected = state.posts.find((post) => post.id === selectId);
      if (selected) openPost(selected);
    }
  }

  function renderPostList() {
    const query = $("[data-admin-search]").value.trim().toLowerCase();
    const filtered = state.posts.filter((post) => [post.title, post.summary, post.subject, ...(post.tags || [])].join(" ").toLowerCase().includes(query));
    $("[data-post-total]").textContent = state.posts.length;
    if (!filtered.length) {
      postList.innerHTML = `<div class="post-list-empty">${state.posts.length ? "没有找到匹配的记录。" : "还没有记录。点击上方按钮，写下第一篇。"}</div>`;
      return;
    }
    postList.innerHTML = filtered.map((post) => `
      <button class="sidebar-post ${state.current?.id === post.id ? "active" : ""}" type="button" data-open-id="${post.id}">
        <div class="sidebar-post-meta"><span>${escapeHtml(post.subject)}</span><span class="${post.status === "published" ? "published-badge" : "draft-badge"}">${post.status === "published" ? "已发布" : "草稿"}</span></div>
        <h3>${escapeHtml(post.title || "未命名记录")}</h3>
        <div class="sidebar-post-meta"><span>${formatDate(post.updatedAt)}</span><span>REV. ${post.revision || 1}</span></div>
      </button>
    `).join("");
  }

  function newPost() {
    if (!confirmDiscard()) return;
    state.current = { id: "", status: "draft", subject: "数学", tags: [], isPinned: false };
    fillForm(state.current);
    form.hidden = false;
    editorEmpty.hidden = true;
    $("[data-archive]").hidden = true;
    $("[data-delete]").hidden = true;
    markDirty(false);
    $("[data-title]").focus();
    renderPostList();
  }

  function openPost(post) {
    if (state.current?.id === post.id) return;
    if (!confirmDiscard()) return;
    state.current = { ...post };
    fillForm(post);
    form.hidden = false;
    editorEmpty.hidden = true;
    $("[data-archive]").hidden = false;
    $("[data-delete]").hidden = false;
    markDirty(false);
    renderPostList();
  }

  function fillForm(post) {
    $("[data-id]").value = post.id || "";
    $("[data-title]").value = post.title || "";
    $("[data-summary]").value = post.summary || "";
    content.value = post.content || "";
    $("[data-subject]").value = post.subject || "其他";
    $("[data-tags]").value = (post.tags || []).join("，");
    $("[data-pinned]").checked = Boolean(post.isPinned);
    $("[data-status-label]").textContent = post.status === "published" ? `已发布 · ${formatDate(post.publishedAt)}` : post.id ? "草稿" : "新草稿";
    $(".status-dot").classList.toggle("published", post.status === "published");
    $("[data-publish]").textContent = post.status === "published" ? "更新发布" : "发布记录";
    preview.innerHTML = renderMarkdown(content.value);
    setPreview(false);
  }

  function collectPayload(status) {
    return {
      id: $("[data-id]").value || undefined,
      title: $("[data-title]").value.trim(),
      summary: $("[data-summary]").value.trim(),
      content: content.value,
      subject: $("[data-subject]").value,
      tags: $("[data-tags]").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      isPinned: $("[data-pinned]").checked,
      status,
    };
  }

  async function save(status) {
    if (state.saving) return;
    const payload = collectPayload(status);
    if (!payload.title) { toast("请先填写标题。", true); $("[data-title]").focus(); return; }
    state.saving = true;
    $("[data-save-state]").textContent = "正在保存…";
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
      toast(status === "published" ? "记录已发布。" : "草稿已保存。");
    } catch (error) {
      $("[data-save-state]").textContent = "保存失败";
      toast(error.message || "保存失败，请稍后重试。", true);
    } finally {
      state.saving = false;
    }
  }

  async function archiveCurrent() {
    if (!state.current?.id) return;
    if (!confirm(`确定归档“${state.current.title}”吗？它会从公开页面和编辑列表中隐藏，但内容不会被删除。`)) return;
    const response = await fetch(apiUrl(`/api/study/admin/posts/${state.current.id}/archive`), { method: "POST" });
    const data = await response.json();
    if (!response.ok) return toast(data.error || "归档失败。", true);
    state.current = null;
    form.hidden = true;
    editorEmpty.hidden = false;
    markDirty(false);
    await loadPosts();
    toast("记录已归档，数据仍然保留。 ");
  }

  async function deleteCurrent() {
    if (!state.current?.id) return;
    const title = state.current.title || "未命名记录";
    if (!confirm(`确定永久删除“${title}”吗？\n\n记录正文和关联图片都会被移除，删除后无法恢复。`)) return;
    if (prompt("这是最后一次确认。请输入“永久删除”继续：") !== "永久删除") {
      toast("已取消永久删除。");
      return;
    }
    const response = await fetch(apiUrl(`/api/study/admin/posts/${state.current.id}`), { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return toast(data.error || "永久删除失败。", true);
    state.current = null;
    form.hidden = true;
    editorEmpty.hidden = false;
    localStorage.removeItem("ruru-study-unsaved");
    markDirty(false);
    await loadPosts();
    toast(data.deletedAssets ? `记录已永久删除，同时清理了 ${data.deletedAssets} 张图片。` : "记录已永久删除。");
  }

  function markDirty(dirty = true) {
    state.dirty = dirty;
    const root = $("[data-save-state]");
    root.textContent = dirty ? "有尚未保存的修改" : "所有修改均已保存";
    root.classList.toggle("dirty", dirty);
    if (dirty) {
      localStorage.setItem("ruru-study-unsaved", JSON.stringify({ ...collectPayload(state.current?.status || "draft"), savedAt: Date.now() }));
    }
  }

  function confirmDiscard() {
    return !state.dirty || confirm("当前有尚未保存的修改，确定离开吗？");
  }

  function setPreview(next) {
    state.preview = next;
    preview.hidden = !next;
    content.hidden = next;
    $("[data-preview-toggle]").textContent = next ? "继续编辑" : "预览";
    if (next) preview.innerHTML = renderMarkdown(content.value) || "<p>还没有正文内容。</p>";
  }

  function insertAtCursor(before, after = "") {
    const start = content.selectionStart;
    const end = content.selectionEnd;
    const selected = content.value.slice(start, end);
    content.setRangeText(`${before}${selected}${after}`, start, end, "end");
    content.focus();
    markDirty();
  }

  async function uploadFiles(files) {
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
        const alt = file.name.replace(/\.[^.]+$/, "") || "错题图片";
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
  $("[data-new-post]").addEventListener("click", newPost);
  $("[data-empty-new]").addEventListener("click", newPost);
  $("[data-retry-auth]").addEventListener("click", boot);
  $("[data-admin-search]").addEventListener("input", renderPostList);
  form.addEventListener("input", () => markDirty());
  form.addEventListener("submit", (event) => { event.preventDefault(); save("published"); });
  $("[data-save-draft]").addEventListener("click", () => save("draft"));
  $("[data-preview-toggle]").addEventListener("click", () => setPreview(!state.preview));
  $("[data-archive]").addEventListener("click", archiveCurrent);
  $("[data-delete]").addEventListener("click", deleteCurrent);
  document.querySelectorAll("[data-insert]").forEach((button) => button.addEventListener("click", () => insertAtCursor(button.dataset.insert)));
  document.querySelectorAll("[data-wrap]").forEach((button) => button.addEventListener("click", () => insertAtCursor(button.dataset.wrap, button.dataset.wrap)));

  const uploadZone = $("[data-upload-zone]");
  const fileInput = $("[data-file-input]");
  uploadZone.addEventListener("click", () => fileInput.click());
  uploadZone.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); fileInput.click(); } });
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
