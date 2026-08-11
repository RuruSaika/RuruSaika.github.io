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

  function createMarkdownParser() {
    if (typeof window.markdownit !== "function") return null;
    const parser = window.markdownit({
      html: false,
      linkify: true,
      breaks: false,
      typographer: false,
    });

    const defaultImage = parser.renderer.rules.image
      || ((tokens, index, options, env, renderer) => renderer.renderToken(tokens, index, options));
    parser.renderer.rules.image = (tokens, index, options, env, renderer) => {
      const token = tokens[index];
      const src = assetUrl(token.attrGet("src") || "");
      if (!src) return "";
      token.attrSet("src", src);
      token.attrSet("loading", "lazy");
      token.attrSet("decoding", "async");
      return defaultImage(tokens, index, options, env, renderer);
    };

    const defaultLinkOpen = parser.renderer.rules.link_open
      || ((tokens, index, options, env, renderer) => renderer.renderToken(tokens, index, options));
    parser.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
      const token = tokens[index];
      if (/^https?:\/\//i.test(token.attrGet("href") || "")) {
        token.attrSet("target", "_blank");
        token.attrSet("rel", "noreferrer");
      }
      return defaultLinkOpen(tokens, index, options, env, renderer);
    };

    const shiftHeading = (tokens, index, options, env, renderer) => {
      const token = tokens[index];
      const level = Number(token.tag.slice(1));
      token.tag = `h${Math.min(6, level + 1)}`;
      return renderer.renderToken(tokens, index, options);
    };
    parser.renderer.rules.heading_open = shiftHeading;
    parser.renderer.rules.heading_close = shiftHeading;

    parser.core.ruler.after("inline", "task-list-items", (state) => {
      for (let index = 2; index < state.tokens.length; index += 1) {
        const inline = state.tokens[index];
        if (inline.type !== "inline"
          || state.tokens[index - 1].type !== "paragraph_open"
          || state.tokens[index - 2].type !== "list_item_open"
          || inline.children?.[0]?.type !== "text") continue;
        const match = inline.children[0].content.match(/^\[([ xX])\]\s+/);
        if (!match) continue;
        inline.children[0].content = inline.children[0].content.slice(match[0].length);
        const checkbox = new state.Token("task_checkbox", "input", 0);
        checkbox.meta = { checked: match[1].toLowerCase() === "x" };
        inline.children.unshift(checkbox);
        state.tokens[index - 2].attrJoin("class", "task-list-item");
      }
    });
    parser.renderer.rules.task_checkbox = (tokens, index) => `<input class="task-list-checkbox" type="checkbox" disabled${tokens[index].meta.checked ? " checked" : ""} aria-label="${tokens[index].meta.checked ? "已完成" : "未完成"}">`;

    return parser;
  }

  const markdownParser = createMarkdownParser();

  function renderMarkdown(markdown) {
    const value = String(markdown || "");
    if (markdownParser) return markdownParser.render(value);
    return value ? `<p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>` : "";
  }

  function adjustMarkdownIndent(markdown, selectionStart, selectionEnd, outdent = false) {
    const value = String(markdown || "");
    const start = Math.max(0, Math.min(Number(selectionStart) || 0, value.length));
    const end = Math.max(start, Math.min(Number(selectionEnd) || 0, value.length));
    const lineStart = start > 0 ? value.lastIndexOf("\n", start - 1) + 1 : 0;
    const effectiveEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const nextBreak = value.indexOf("\n", effectiveEnd);
    const lineEnd = nextBreak < 0 ? value.length : nextBreak;
    const block = value.slice(lineStart, lineEnd);
    const changes = [];
    let position = lineStart;

    const adjusted = block.split("\n").map((line) => {
      let nextLine;
      if (outdent) {
        const prefix = line.match(/^(?:\t| {1,2})/)?.[0] || "";
        nextLine = line.slice(prefix.length);
        if (prefix) changes.push({ position, added: 0, removed: prefix.length });
      } else {
        nextLine = `  ${line}`;
        changes.push({ position, added: 2, removed: 0 });
      }
      position += line.length + 1;
      return nextLine;
    }).join("\n");

    const mapPosition = (original) => changes.reduce((mapped, change) => {
      if (change.added && change.position <= original) return mapped + change.added;
      if (change.removed && change.position < original) {
        return mapped - Math.min(change.removed, original - change.position);
      }
      return mapped;
    }, original);

    return {
      value: `${value.slice(0, lineStart)}${adjusted}${value.slice(lineEnd)}`,
      selectionStart: mapPosition(start),
      selectionEnd: mapPosition(end),
    };
  }

  function formatDate(value, long = false) {
    if (!value) return "未发布";
    return new Intl.DateTimeFormat("zh-CN", long
      ? { year: "numeric", month: "long", day: "numeric" }
      : { year: "numeric", month: "2-digit", day: "2-digit" }
    ).format(new Date(value));
  }

  window.StudyBoard = { SITES_ORIGIN, apiUrl, assetUrl, escapeHtml, renderMarkdown, adjustMarkdownIndent, formatDate, isSitesHost, isLocal };
})();
