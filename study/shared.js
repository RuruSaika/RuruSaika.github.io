(function () {
  const SITES_ORIGIN = "https://rurusaika-home.rurusaika-official.chatgpt.site";
  const isSitesHost = location.hostname.endsWith("chatgpt.site");
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const apiOrigin = isSitesHost ? "" : SITES_ORIGIN;

  function apiUrl(path) {
    return `${apiOrigin}${path}`;
  }

  function assetUrl(value) {
    const match = String(value || "").match(/^asset:\/\/([a-f0-9-]+)$/i);
    if (match) return apiUrl(`/api/study/assets/${match[1]}`);
    if (value.startsWith("/api/study/")) return apiUrl(value);
    if (value.startsWith("/static/blog/assets/")) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[char]);
  }

  function renderInline(value) {
    let text = escapeHtml(value);
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      const src = assetUrl(url.trim());
      return src ? `<img src="${escapeHtml(src)}" alt="${alt}" loading="lazy">` : "";
    });
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, "$1<em>$2</em>");
    return text;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    const listStack = [];
    let code = null;

    const flushParagraph = () => {
      if (paragraph.length) html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    };
    const closeTopList = () => {
      const list = listStack.pop();
      if (!list) return;
      if (list.itemOpen) html.push("</li>");
      html.push(`</${list.type}>`);
    };
    const closeLists = () => {
      while (listStack.length) closeTopList();
    };
    const appendListItem = (type, indent, content) => {
      while (listStack.length && indent < listStack.at(-1).indent) closeTopList();
      if (listStack.length && indent === listStack.at(-1).indent && type !== listStack.at(-1).type) {
        closeTopList();
      }

      if (!listStack.length || indent > listStack.at(-1).indent) {
        html.push(`<${type}>`);
        listStack.push({ type, indent, itemOpen: false });
      }

      const list = listStack.at(-1);
      if (list.itemOpen) html.push("</li>");
      html.push(`<li>${renderInline(content)}`);
      list.itemOpen = true;
    };

    for (const line of lines) {
      if (line.startsWith("```")) {
        flushParagraph(); closeLists();
        if (code === null) code = [];
        else { html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`); code = null; }
        continue;
      }
      if (code !== null) { code.push(line); continue; }
      if (!line.trim()) { flushParagraph(); closeLists(); continue; }

      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        flushParagraph(); closeLists();
        const level = heading[1].length + 1;
        html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        continue;
      }
      if (/^---+$/.test(line.trim())) { flushParagraph(); closeLists(); html.push("<hr>"); continue; }
      if (line.startsWith("> ")) { flushParagraph(); closeLists(); html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`); continue; }

      const listItem = line.match(/^([ \t]*)([-+*]|\d+[.)])\s+(.+)$/);
      if (listItem) {
        flushParagraph();
        const indent = listItem[1].replace(/\t/g, "    ").length;
        const type = /^\d/.test(listItem[2]) ? "ol" : "ul";
        appendListItem(type, indent, listItem[3]);
        continue;
      }
      closeLists();
      paragraph.push(line.trim());
    }
    flushParagraph(); closeLists();
    if (code !== null) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    return html.join("\n");
  }

  function formatDate(value, long = false) {
    if (!value) return "未发布";
    return new Intl.DateTimeFormat("zh-CN", long
      ? { year: "numeric", month: "long", day: "numeric" }
      : { year: "numeric", month: "2-digit", day: "2-digit" }
    ).format(new Date(value));
  }

  window.StudyBoard = { SITES_ORIGIN, apiUrl, assetUrl, escapeHtml, renderMarkdown, formatDate, isSitesHost, isLocal };
})();
