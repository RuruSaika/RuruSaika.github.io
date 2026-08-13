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

  function setThemeFavicon(theme) {
    document.querySelectorAll("[data-theme-favicon]").forEach((favicon) => {
      const href = theme === "light" ? favicon.dataset.lightHref : favicon.dataset.darkHref;
      if (href && favicon.getAttribute("href") !== href) favicon.setAttribute("href", href);
    });
  }

  function createMarkdownParser() {
    if (typeof window.markdownit !== "function") return null;
    const parser = window.markdownit({
      html: true,
      linkify: true,
      breaks: true,
      typographer: false,
    });

    parser.inline.ruler.before("emphasis", "mark", (state, silent) => {
      const start = state.pos;
      if (state.src.slice(start, start + 2) !== "==" || state.src[start + 2] === "=") return false;
      let end = start + 2;
      while (end < state.posMax) {
        end = state.src.indexOf("==", end);
        if (end < 0 || end >= state.posMax) return false;
        let escapes = 0;
        for (let index = end - 1; index >= 0 && state.src[index] === "\\"; index -= 1) escapes += 1;
        if (escapes % 2 === 0 && end > start + 2 && state.src[end + 2] !== "=") break;
        end += 2;
      }
      if (end >= state.posMax || !state.src.slice(start + 2, end).trim()) return false;
      if (!silent) {
        const opening = state.push("mark_open", "mark", 1);
        opening.markup = "==";
        const originalMax = state.posMax;
        state.pos = start + 2;
        state.posMax = end;
        state.md.inline.tokenize(state);
        state.posMax = originalMax;
        const closing = state.push("mark_close", "mark", -1);
        closing.markup = "==";
      }
      state.pos = end + 2;
      return true;
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

    const headingText = (token) => (token.children || []).map((child) => {
      if (["text", "code_inline", "html_inline"].includes(child.type)) return child.content.replace(/<[^>]*>/g, "");
      return child.type === "image" ? child.content : "";
    }).join("").trim();
    const headingId = (value, usedIds) => {
      const base = String(value || "").normalize("NFKC").trim().toLowerCase()
        .replace(/\s+/g, "-").replace(/[^\p{Letter}\p{Number}_-]/gu, "") || "section";
      const count = (usedIds.get(base) || 0) + 1;
      usedIds.set(base, count);
      return count === 1 ? base : `${base}-${count}`;
    };
    parser.core.ruler.after("inline", "heading-outline", (state) => {
      const usedIds = new Map();
      state.env.outline = [];
      for (let index = 0; index < state.tokens.length; index += 1) {
        const token = state.tokens[index];
        if (token.type !== "heading_open") continue;
        const level = Number(token.tag.slice(1));
        if (level < 1 || level > 4) continue;
        const label = headingText(state.tokens[index + 1]);
        if (!label) continue;
        const id = headingId(label, usedIds);
        token.attrSet("id", id);
        state.env.outline.push({ id, label, level });
      }
    });

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

  const ALLOWED_HTML_TAGS = new Set([
    "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
    "dd", "del", "details", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "header",
    "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "ins", "kbd", "li", "mark", "ol", "p",
    "main", "nav", "pre", "q", "s", "samp", "section", "small", "span", "strong", "sub", "summary", "sup", "table",
    "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
  ]);
  const ALLOWED_HTML_ATTRIBUTES = new Set([
    "abbr", "alt", "aria-label", "aria-hidden", "checked", "class", "colspan", "datetime", "disabled", "height", "href",
    "id", "loading", "open", "reversed", "role", "rowspan", "scope", "src", "start", "style", "title", "type", "width",
  ]);
  const DROP_CONTENT_TAGS = new Set(["base", "embed", "form", "iframe", "link", "meta", "object", "script", "style", "svg", "template"]);
  const SAFE_STYLE_PROPERTIES = new Set([
    "background-color", "border", "border-bottom", "border-color", "border-left", "border-radius", "border-right", "border-top",
    "color", "font-size", "font-style", "font-weight", "height", "letter-spacing", "line-height", "margin", "margin-bottom",
    "margin-left", "margin-right", "margin-top", "max-height", "max-width", "min-height", "min-width", "padding", "padding-bottom",
    "padding-left", "padding-right", "padding-top", "text-align", "text-decoration", "vertical-align", "white-space", "width",
  ]);

  function isSafeUrl(value, image = false) {
    const url = String(value || "").trim();
    if (!url || url.startsWith("#") || url.startsWith("/")) return true;
    if (image && /^asset:\/\/[a-f0-9-]+$/i.test(url)) return true;
    return /^(?:https?:|mailto:|tel:)/i.test(url);
  }

  function sanitizeStyle(value) {
    return String(value || "").split(";").map((declaration) => declaration.trim()).filter(Boolean).map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) return "";
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const styleValue = declaration.slice(separator + 1).trim();
      if (!SAFE_STYLE_PROPERTIES.has(property) || !styleValue || /(?:url|expression|@import|javascript|behavior)\s*[:(]/i.test(styleValue)) return "";
      return `${property}: ${styleValue}`;
    }).filter(Boolean).join("; ");
  }

  function sanitizeRenderedHtml(html) {
    if (typeof window.DOMParser !== "function") return html;
    const document = new window.DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const elements = [...document.body.querySelectorAll("*")];
    elements.forEach((element) => {
      const tag = element.localName;
      if (!ALLOWED_HTML_TAGS.has(tag)) {
        if (DROP_CONTENT_TAGS.has(tag)) element.remove();
        else element.replaceWith(...element.childNodes);
        return;
      }
      [...element.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (!ALLOWED_HTML_ATTRIBUTES.has(name) && !name.startsWith("data-")) element.removeAttribute(attribute.name);
      });
      if (element.hasAttribute("style")) {
        const style = sanitizeStyle(element.getAttribute("style"));
        if (style) element.setAttribute("style", style);
        else element.removeAttribute("style");
      }
      if (tag === "input") {
        if (element.getAttribute("type") !== "checkbox") element.remove();
        else element.setAttribute("disabled", "");
      }
      if (element.hasAttribute("href") && !isSafeUrl(element.getAttribute("href"))) element.removeAttribute("href");
      if (element.hasAttribute("src")) {
        const original = element.getAttribute("src") || "";
        if (tag !== "img" || !isSafeUrl(original, true)) element.removeAttribute("src");
        else {
          const resolved = assetUrl(original);
          if (resolved) element.setAttribute("src", resolved);
          else element.removeAttribute("src");
        }
      }
      if (tag === "img") {
        element.setAttribute("loading", "lazy");
        element.setAttribute("decoding", "async");
      }
      if (tag === "a" && /^https?:\/\//i.test(element.getAttribute("href") || "")) {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noreferrer");
      }
    });
    return document.body.innerHTML;
  }

  function renderMarkdownDocument(markdown) {
    const value = String(markdown || "");
    if (markdownParser) {
      const latexExpressions = [];
      const protectedValue = value.replace(
        /\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?:\\.|[^\\\n$])+(?<!\\)\$/g,
        (expression) => {
          const token = `\uE000RURULATEX${latexExpressions.length}\uE001`;
          latexExpressions.push({ token, expression: escapeHtml(expression) });
          return token;
        },
      );
      const env = {};
      const rendered = sanitizeRenderedHtml(markdownParser.render(protectedValue, env));
      const html = latexExpressions.reduce(
        (html, item) => html.split(item.token).join(item.expression),
        rendered,
      );
      return { html, outline: env.outline || [] };
    }
    return { html: value ? `<p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>` : "", outline: [] };
  }

  function renderMarkdown(markdown) {
    return renderMarkdownDocument(markdown).html;
  }

  function renderOutline(outline, label = "文章目录") {
    if (!Array.isArray(outline) || !outline.length) return "";
    return `<nav class="article-outline" aria-label="${escapeHtml(label)}"><span class="article-outline-indicator" aria-hidden="true"></span><p>${escapeHtml(label)}</p><ol>${outline.map((item) => (
      `<li data-level="${Number(item.level) || 1}"><a href="#${encodeURIComponent(item.id)}">${escapeHtml(item.label)}</a></li>`
    )).join("")}</ol></nav>`;
  }

  function bindOutlineTracking(root, scrollRoot = window) {
    const outline = root?.querySelector?.(".article-outline");
    if (!outline) return () => {};
    const links = [...outline.querySelectorAll("a[href^='#']")];
    const entries = links.map((link) => {
      let id = link.getAttribute("href").slice(1);
      try { id = decodeURIComponent(id); } catch {}
      return { link, heading: root.querySelector(`#${window.CSS?.escape ? window.CSS.escape(id) : id}`) };
    }).filter((entry) => entry.heading);
    if (!entries.length) return () => {};

    const scrollingElement = document.scrollingElement;
    const usesWindow = scrollRoot === window || scrollRoot === document || scrollRoot === scrollingElement;
    const eventRoot = usesWindow ? window : scrollRoot;
    let activeLink = null;
    let frame = 0;

    const update = () => {
      frame = 0;
      const rootTop = usesWindow ? 0 : scrollRoot.getBoundingClientRect().top;
      const rootHeight = usesWindow ? window.innerHeight : scrollRoot.clientHeight;
      const activationOffset = Math.min(rootHeight * 0.3, 192);
      const activationLine = rootTop + activationOffset;
      const reserve = root.querySelector(".blog-article-reserve");
      if (reserve) reserve.style.minHeight = `${Math.ceil(rootHeight - activationOffset + 32)}px`;
      let active = entries[0];
      entries.forEach((entry) => {
        if (entry.heading.getBoundingClientRect().top <= activationLine + 1) active = entry;
      });
      if (active.link === activeLink) return;

      activeLink?.removeAttribute("aria-current");
      activeLink?.classList.remove("active");
      activeLink = active.link;
      activeLink.classList.add("active");
      activeLink.setAttribute("aria-current", "location");
      outline.classList.add("has-active");

      const indicatorHeight = Math.min(18, Math.max(12, activeLink.offsetHeight));
      const indicatorTop = activeLink.offsetTop + (activeLink.offsetHeight - indicatorHeight) / 2;
      outline.style.setProperty("--outline-indicator-y", `${indicatorTop}px`);
      outline.style.setProperty("--outline-indicator-height", `${indicatorHeight}px`);

      const item = activeLink.closest("li");
      if (!item || outline.scrollHeight <= outline.clientHeight) return;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      const visibleTop = outline.scrollTop;
      const visibleBottom = visibleTop + outline.clientHeight;
      if (itemTop < visibleTop || itemBottom > visibleBottom) {
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        outline.scrollTo({
          top: Math.max(0, itemTop - outline.clientHeight * 0.4),
          behavior: reducedMotion ? "auto" : "smooth",
        });
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    eventRoot.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.requestAnimationFrame(update);
    return () => {
      eventRoot.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }

  function renderLatex(root) {
    if (!root || typeof window.renderMathInElement !== "function") return;
    window.renderMathInElement(root, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
      strict: "warn",
      trust: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      ignoredClasses: ["no-latex"],
    });
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

  window.StudyBoard = { SITES_ORIGIN, apiUrl, assetUrl, escapeHtml, setThemeFavicon, renderMarkdown, renderMarkdownDocument, renderOutline, bindOutlineTracking, renderLatex, adjustMarkdownIndent, formatDate, isSitesHost, isLocal };
})();
