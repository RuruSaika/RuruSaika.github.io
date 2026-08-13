const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const ALLOWED_CATEGORIES = new Set(["生活", "学习", "其它"]);
const LEGACY_STUDY_CATEGORIES = new Set(["数学", "英语", "政治", "专业课", "复盘"]);
const GITHUB_SYNC_ENDPOINT = "https://api.github.com/repos/RuruSaika/RuruSaika.github.io/actions/workflows/sync-blog.yml/dispatches";
let schemaPromise;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/study/")) {
        await ensureSchema(env);
        return await handleApi(request, env, url);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("study-board error", error);
      return json({ error: "服务器暂时无法完成请求，请稍后重试。" }, 500, corsHeaders(request, env));
    }
  },
};

async function handleApi(request, env, url) {
  const cors = corsHeaders(request, env);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (url.pathname === "/api/study/posts" && request.method === "GET") {
    const requestedCategory = normalizeRequestedCategory(url.searchParams.get("category") || url.searchParams.get("subject"));
    const requestedSort = url.searchParams.get("sort") === "date" ? "date" : "manual";
    const orderBy = requestedSort === "date"
      ? "updated_at DESC"
      : "CASE WHEN sort_order = 0 THEN 0 ELSE 1 END ASC, CASE WHEN sort_order = 0 THEN updated_at END DESC, sort_order ASC, updated_at DESC";
    const limit = clamp(Number(url.searchParams.get("limit")) || 50, 1, 100);
    let query;
    if (requestedCategory === "学习") {
      query = env.DB.prepare(`
          SELECT id, slug, title, summary, subject, tags_json, is_pinned, sort_order,
                 published_at, updated_at
          FROM study_posts
          WHERE status = 'published' AND subject IN ('学习', '数学', '英语', '政治', '专业课', '复盘')
          ORDER BY ${orderBy}
          LIMIT ?
        `).bind(limit);
    } else if (requestedCategory === "其它") {
      query = env.DB.prepare(`
          SELECT id, slug, title, summary, subject, tags_json, is_pinned, sort_order,
                 published_at, updated_at
          FROM study_posts
          WHERE status = 'published' AND subject IN ('其它', '其他')
          ORDER BY ${orderBy}
          LIMIT ?
        `).bind(limit);
    } else if (requestedCategory === "生活") {
      query = env.DB.prepare(`
          SELECT id, slug, title, summary, subject, tags_json, is_pinned, sort_order,
                 published_at, updated_at
          FROM study_posts
          WHERE status = 'published' AND subject = '生活'
          ORDER BY ${orderBy}
          LIMIT ?
        `).bind(limit);
    } else {
      query = env.DB.prepare(`
          SELECT id, slug, title, summary, subject, tags_json, is_pinned, sort_order,
                 published_at, updated_at
          FROM study_posts
          WHERE status = 'published'
          ORDER BY ${orderBy}
          LIMIT ?
        `).bind(limit);
    }
    const result = await query.all();
    return json({ posts: result.results.map(serializePost), sort: requestedSort }, 200, cors);
  }

  const publicPostMatch = url.pathname.match(/^\/api\/study\/posts\/([^/]+)$/);
  if (publicPostMatch && request.method === "GET") {
    const slug = decodeURIComponent(publicPostMatch[1]);
    const post = await env.DB.prepare(`
      SELECT id, slug, title, summary, content, subject, tags_json, is_pinned, sort_order,
             published_at, updated_at
      FROM study_posts
      WHERE (slug = ? OR title = ?) AND status = 'published'
      LIMIT 1
    `).bind(slug, slug).first();
    return post
      ? json({ post: serializePost(post) }, 200, cors)
      : json({ error: "没有找到这篇文章。" }, 404, cors);
  }

  const assetMatch = url.pathname.match(/^\/api\/study\/assets\/([a-f0-9-]+)$/i);
  if (assetMatch && request.method === "GET") {
    const asset = await env.DB.prepare(`
      SELECT r2_key, original_name, content_type
      FROM study_assets WHERE id = ? LIMIT 1
    `).bind(assetMatch[1]).first();
    if (!asset) return json({ error: "图片不存在。" }, 404, cors);

    const object = await env.UPLOADS.get(asset.r2_key);
    if (!object) return json({ error: "图片不存在。" }, 404, cors);
    const headers = new Headers(cors);
    headers.set("content-type", asset.content_type);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.original_name)}`);
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  }

  if (!url.pathname.startsWith("/api/study/admin/")) {
    return json({ error: "接口不存在。" }, 404, cors);
  }

  if (!isSameOriginWrite(request) && request.method !== "GET") {
    return json({ error: "拒绝跨站写入。" }, 403);
  }

  const auth = getAdmin(request, env);
  if (!auth.ok) {
    return json({
      error: auth.signedIn ? "当前账号没有编辑权限。" : "请先登录后再编辑。",
      signedIn: auth.signedIn,
      signInPath: "/signin-with-chatgpt?return_to=%2Fstudy%2Fadmin%2F",
    }, auth.signedIn ? 403 : 401, { "cache-control": "no-store" });
  }

  if (url.pathname === "/api/study/admin/session" && request.method === "GET") {
    return json({ user: { email: auth.email }, role: "owner" }, 200, { "cache-control": "no-store" });
  }

  if (url.pathname === "/api/study/admin/posts/reorder" && request.method === "POST") {
    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: "排序数据无效。" }, 400); }
    const ids = Array.isArray(payload.ids) ? payload.ids : [];
    if (!ids.length || ids.length > 200 || ids.some((id) => !validId(id)) || new Set(ids).size !== ids.length) {
      return json({ error: "排序列表无效。" }, 400);
    }
    const existing = await env.DB.prepare("SELECT id FROM study_posts WHERE status != 'archived'").all();
    const existingIds = new Set(existing.results.map((row) => row.id));
    if (existingIds.size !== ids.length || ids.some((id) => !existingIds.has(id))) {
      return json({ error: "文章列表已经变化，请刷新后重试。" }, 409);
    }
    await env.DB.batch(ids.map((id, index) => env.DB.prepare(
      "UPDATE study_posts SET sort_order = ? WHERE id = ?",
    ).bind(index + 1, id)));
    const sync = await requestPublicMirrorSync(env, "reorder");
    return json({ ok: true, sync });
  }

  if (url.pathname === "/api/study/admin/posts" && request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT id, slug, title, summary, content, subject, tags_json, status,
             is_pinned, sort_order, published_at, created_at, updated_at
      FROM study_posts
      WHERE status != 'archived'
      ORDER BY CASE WHEN sort_order = 0 THEN 0 ELSE 1 END ASC,
               CASE WHEN sort_order = 0 THEN published_at END DESC,
               sort_order ASC, updated_at DESC
      LIMIT 200
    `).all();
    return json({ posts: result.results.map(serializePost) });
  }

  if (url.pathname === "/api/study/admin/posts" && request.method === "POST") {
    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: "文章格式无效。" }, 400); }
    const now = new Date().toISOString();
    const id = validId(payload.id) ? payload.id : crypto.randomUUID();
    const existing = validId(payload.id)
      ? await env.DB.prepare("SELECT id, slug, status, created_at, published_at, sort_order, is_pinned FROM study_posts WHERE id = ? LIMIT 1").bind(id).first()
      : null;
    const title = cleanText(payload.title, 120);
    if (!title) return json({ error: "标题不能为空。" }, 400);
    const content = cleanText(payload.content, 200000);
    const summary = cleanText(payload.summary, 400);
    const subject = normalizeCategory(payload.subject);
    const tags = normalizeTags(payload.tags);
    const status = ["draft", "published"].includes(payload.status) ? payload.status : "draft";
    // Manual ordering supersedes pinning. Preserve legacy values on edits so
    // removing the editor control does not silently rewrite existing records.
    const isPinned = existing ? Number(existing.is_pinned || 0) : 0;
    const slug = title;
    const duplicate = await env.DB.prepare("SELECT id FROM study_posts WHERE (slug = ? OR title = ?) AND id <> ? LIMIT 1").bind(slug, title, id).first();
    if (duplicate) return json({ error: "已经存在同名文章，请使用不同的标题。" }, 409);
    const createdAt = existing?.created_at || now;
    const publishedAt = status === "published" ? (existing?.published_at || now) : existing?.published_at || null;
    const nextOrder = existing
      ? Number(existing.sort_order || 0)
      : Number((await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM study_posts").first())?.value || 0) + 1;

    await env.DB.prepare(`
      INSERT INTO study_posts (
        id, slug, title, summary, content, subject, tags_json, status,
        is_pinned, sort_order, author_email, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        summary = excluded.summary,
        content = excluded.content,
        subject = excluded.subject,
        tags_json = excluded.tags_json,
        status = excluded.status,
        is_pinned = excluded.is_pinned,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at
    `).bind(
      id, slug, title, summary, content, subject, JSON.stringify(tags), status,
      isPinned, nextOrder, auth.email, publishedAt, createdAt, now,
    ).run();

    const saved = await env.DB.prepare(`
      SELECT id, slug, title, summary, content, subject, tags_json, status,
             is_pinned, sort_order, published_at, created_at, updated_at
      FROM study_posts WHERE id = ? LIMIT 1
    `).bind(id).first();
    const affectsPublicMirror = status === "published" || existing?.status === "published";
    const sync = affectsPublicMirror
      ? await requestPublicMirrorSync(env, status === "published" ? "publish" : "unpublish")
      : { queued: false, reason: "not_public" };
    return json({ post: serializePost(saved), sync }, existing ? 200 : 201);
  }

  const archiveMatch = url.pathname.match(/^\/api\/study\/admin\/posts\/([a-f0-9-]+)\/archive$/i);
  if (archiveMatch && request.method === "POST") {
    const existing = await env.DB.prepare("SELECT status FROM study_posts WHERE id = ? LIMIT 1").bind(archiveMatch[1]).first();
    await env.DB.prepare(`
      UPDATE study_posts SET status = 'archived', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), archiveMatch[1]).run();
    const sync = existing?.status === "published"
      ? await requestPublicMirrorSync(env, "archive")
      : { queued: false, reason: "not_public" };
    return json({ ok: true, sync });
  }

  const deleteMatch = url.pathname.match(/^\/api\/study\/admin\/posts\/([a-f0-9-]+)$/i);
  if (deleteMatch && request.method === "DELETE") {
    const postId = deleteMatch[1];
    const post = await env.DB.prepare("SELECT id, content, status FROM study_posts WHERE id = ? LIMIT 1").bind(postId).first();
    if (!post) return json({ error: "没有找到要删除的文章。" }, 404);

    const linked = await env.DB.prepare(`
      SELECT id, post_id, r2_key FROM study_assets WHERE post_id = ?
    `).bind(postId).all();
    const tokenIds = [...new Set([...String(post.content || "").matchAll(/asset:\/\/([a-f0-9-]{36})/gi)].map((match) => match[1]))];
    const referenced = await Promise.all(tokenIds.map((id) => env.DB.prepare(`
      SELECT id, post_id, r2_key FROM study_assets WHERE id = ? LIMIT 1
    `).bind(id).first()));
    const assets = new Map();
    [...linked.results, ...referenced.filter((asset) => asset && (!asset.post_id || asset.post_id === postId))]
      .forEach((asset) => assets.set(asset.id, asset));

    await Promise.all([...assets.values()].map((asset) => env.UPLOADS.delete(asset.r2_key)));
    const deletes = [...assets.keys()].map((id) => env.DB.prepare("DELETE FROM study_assets WHERE id = ?").bind(id));
    deletes.push(env.DB.prepare("DELETE FROM study_posts WHERE id = ?").bind(postId));
    await env.DB.batch(deletes);
    const sync = post.status === "published"
      ? await requestPublicMirrorSync(env, "delete")
      : { queued: false, reason: "not_public" };
    return json({ ok: true, deletedAssets: assets.size, sync });
  }

  if (url.pathname === "/api/study/admin/upload" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "请选择图片文件。" }, 400);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return json({ error: "仅支持 JPG、PNG、WebP 或 GIF 图片。" }, 400);
    if (file.size > MAX_IMAGE_BYTES) return json({ error: "单张图片不能超过 8 MB。" }, 400);

    const id = crypto.randomUUID();
    const ext = ALLOWED_IMAGE_TYPES.get(file.type);
    const day = new Date().toISOString().slice(0, 10);
    const key = `study/${day}/${id}.${ext}`;
    await env.UPLOADS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedBy: auth.email },
    });
    await env.DB.prepare(`
      INSERT INTO study_assets (
        id, post_id, r2_key, original_name, content_type, size_bytes, alt_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      validId(form.get("postId")) ? form.get("postId") : null,
      key,
      cleanText(file.name, 180) || `image.${ext}`,
      file.type,
      file.size,
      cleanText(form.get("alt"), 200),
      new Date().toISOString(),
    ).run();
    return json({ asset: { id, token: `asset://${id}`, url: `/api/study/assets/${id}` } }, 201);
  }

  if (url.pathname === "/api/study/admin/export" && request.method === "GET") {
    const [posts, assets] = await Promise.all([
      env.DB.prepare("SELECT * FROM study_posts ORDER BY created_at ASC").all(),
      env.DB.prepare("SELECT id, post_id, original_name, content_type, size_bytes, alt_text, created_at FROM study_assets ORDER BY created_at ASC").all(),
    ]);
    const headers = new Headers(JSON_HEADERS);
    headers.set("content-disposition", `attachment; filename="ruru-blog-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), posts: posts.results, assets: assets.results }, null, 2), { headers });
  }

  return json({ error: "接口不存在。" }, 404);
}

async function ensureSchema(env) {
  if (!env.DB || !env.UPLOADS) throw new Error("Study storage bindings are unavailable");
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_posts (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '其他',
        tags_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        author_email TEXT NOT NULL,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_assets (
        id TEXT PRIMARY KEY NOT NULL,
        post_id TEXT,
        r2_key TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        alt_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (post_id) REFERENCES study_posts(id) ON DELETE SET NULL
      )`),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_study_posts_status_published_at ON study_posts(status, published_at DESC)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_study_posts_subject_status ON study_posts(subject, status)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_study_assets_post_id ON study_assets(post_id)"),
      ]);
      const columns = await env.DB.prepare("PRAGMA table_info(study_posts)").all();
      if (!columns.results.some((column) => column.name === "sort_order")) {
        await env.DB.prepare("ALTER TABLE study_posts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
      }
      if (columns.results.some((column) => column.name === "revision")) {
        await env.DB.prepare("ALTER TABLE study_posts DROP COLUMN revision").run();
      }
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_study_posts_sort_order ON study_posts(sort_order)").run();
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

function getAdmin(request, env) {
  const email = (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
  const userId = request.headers.get("oai-authenticated-user-id");
  const ownerEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  return { ok: Boolean(userId && email && ownerEmail && email === ownerEmail), signedIn: Boolean(userId && email), email };
}

function isSameOriginWrite(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = new Set([
    "https://rurusaika.github.io",
    String(env.PUBLIC_SITE_ORIGIN || "").replace(/\/$/, ""),
  ]);
  const headers = new Headers({
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
  });
  if (origin && allowed.has(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(data, status = 200, extraHeaders) {
  const headers = new Headers(JSON_HEADERS);
  if (extraHeaders) new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(data), { status, headers });
}

function serializePost(row) {
  if (!row) return null;
  let tags = [];
  try { tags = JSON.parse(row.tags_json || "[]"); } catch {}
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    content: row.content,
    subject: normalizeCategory(row.subject),
    tags,
    status: row.status,
    isPinned: Boolean(row.is_pinned),
    sortOrder: Number(row.sort_order || 0),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,，]/);
  return [...new Set(list.map((tag) => cleanText(tag, 24)).filter(Boolean))].slice(0, 10);
}

function normalizeCategory(value) {
  const category = cleanText(value, 30);
  if (LEGACY_STUDY_CATEGORIES.has(category)) return "学习";
  if (category === "其他") return "其它";
  return ALLOWED_CATEGORIES.has(category) ? category : "其它";
}

function normalizeRequestedCategory(value) {
  const category = cleanText(value, 30);
  if (!category) return "";
  if (LEGACY_STUDY_CATEGORIES.has(category)) return "学习";
  if (category === "其他") return "其它";
  return ALLOWED_CATEGORIES.has(category) ? category : "";
}

function cleanText(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function validId(value) {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

async function requestPublicMirrorSync(env, reason) {
  const token = String(env.GITHUB_SYNC_TOKEN || "").trim();
  if (!token) {
    console.warn("public mirror dispatch skipped: GITHUB_SYNC_TOKEN is not configured");
    return { queued: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(GITHUB_SYNC_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "RuruSaikaBlogPublisher/1.0",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main", inputs: { reason } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("public mirror dispatch failed", response.status, (await response.text()).slice(0, 500));
      return { queued: false, reason: "github_rejected" };
    }
    return { queued: true };
  } catch (error) {
    console.error("public mirror dispatch failed", error);
    return { queued: false, reason: "request_failed" };
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
