const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const ALLOWED_SUBJECTS = new Set(["数学", "英语", "政治", "专业课", "复盘", "其他"]);
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
    const subject = cleanText(url.searchParams.get("subject"), 30);
    const limit = clamp(Number(url.searchParams.get("limit")) || 50, 1, 100);
    const query = subject && ALLOWED_SUBJECTS.has(subject)
      ? env.DB.prepare(`
          SELECT id, slug, title, summary, subject, tags_json, is_pinned,
                 published_at, updated_at
          FROM study_posts
          WHERE status = 'published' AND subject = ?
          ORDER BY is_pinned DESC, published_at DESC
          LIMIT ?
        `).bind(subject, limit)
      : env.DB.prepare(`
          SELECT id, slug, title, summary, subject, tags_json, is_pinned,
                 published_at, updated_at
          FROM study_posts
          WHERE status = 'published'
          ORDER BY is_pinned DESC, published_at DESC
          LIMIT ?
        `).bind(limit);
    const result = await query.all();
    return json({ posts: result.results.map(serializePost) }, 200, cors);
  }

  const publicPostMatch = url.pathname.match(/^\/api\/study\/posts\/([^/]+)$/);
  if (publicPostMatch && request.method === "GET") {
    const slug = decodeURIComponent(publicPostMatch[1]);
    const post = await env.DB.prepare(`
      SELECT id, slug, title, summary, content, subject, tags_json, is_pinned,
             published_at, updated_at
      FROM study_posts
      WHERE slug = ? AND status = 'published'
      LIMIT 1
    `).bind(slug).first();
    return post
      ? json({ post: serializePost(post) }, 200, cors)
      : json({ error: "没有找到这篇记录。" }, 404, cors);
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
    }, auth.signedIn ? 403 : 401);
  }

  if (url.pathname === "/api/study/admin/session" && request.method === "GET") {
    return json({ user: { email: auth.email }, role: "owner" });
  }

  if (url.pathname === "/api/study/admin/posts" && request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT id, slug, title, summary, content, subject, tags_json, status,
             is_pinned, published_at, created_at, updated_at, revision
      FROM study_posts
      WHERE status != 'archived'
      ORDER BY updated_at DESC
      LIMIT 200
    `).all();
    return json({ posts: result.results.map(serializePost) });
  }

  if (url.pathname === "/api/study/admin/posts" && request.method === "POST") {
    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: "记录格式无效。" }, 400); }
    const now = new Date().toISOString();
    const id = validId(payload.id) ? payload.id : crypto.randomUUID();
    const existing = validId(payload.id)
      ? await env.DB.prepare("SELECT id, slug, created_at, published_at, revision FROM study_posts WHERE id = ? LIMIT 1").bind(id).first()
      : null;
    const title = cleanText(payload.title, 120);
    if (!title) return json({ error: "标题不能为空。" }, 400);
    const content = cleanText(payload.content, 200000);
    const summary = cleanText(payload.summary, 400);
    const subject = ALLOWED_SUBJECTS.has(payload.subject) ? payload.subject : "其他";
    const tags = normalizeTags(payload.tags);
    const status = ["draft", "published"].includes(payload.status) ? payload.status : "draft";
    const isPinned = payload.isPinned ? 1 : 0;
    const slug = existing?.slug || createSlug(now);
    const createdAt = existing?.created_at || now;
    const publishedAt = status === "published" ? (existing?.published_at || now) : existing?.published_at || null;
    const revision = Number(existing?.revision || 0) + 1;

    await env.DB.prepare(`
      INSERT INTO study_posts (
        id, slug, title, summary, content, subject, tags_json, status,
        is_pinned, author_email, published_at, created_at, updated_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        content = excluded.content,
        subject = excluded.subject,
        tags_json = excluded.tags_json,
        status = excluded.status,
        is_pinned = excluded.is_pinned,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at,
        revision = excluded.revision
    `).bind(
      id, slug, title, summary, content, subject, JSON.stringify(tags), status,
      isPinned, auth.email, publishedAt, createdAt, now, revision,
    ).run();

    const saved = await env.DB.prepare(`
      SELECT id, slug, title, summary, content, subject, tags_json, status,
             is_pinned, published_at, created_at, updated_at, revision
      FROM study_posts WHERE id = ? LIMIT 1
    `).bind(id).first();
    return json({ post: serializePost(saved) }, existing ? 200 : 201);
  }

  const archiveMatch = url.pathname.match(/^\/api\/study\/admin\/posts\/([a-f0-9-]+)\/archive$/i);
  if (archiveMatch && request.method === "POST") {
    await env.DB.prepare(`
      UPDATE study_posts SET status = 'archived', updated_at = ?, revision = revision + 1
      WHERE id = ?
    `).bind(new Date().toISOString(), archiveMatch[1]).run();
    return json({ ok: true });
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
    headers.set("content-disposition", `attachment; filename="ruru-study-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), posts: posts.results, assets: assets.results }, null, 2), { headers });
  }

  return json({ error: "接口不存在。" }, 404);
}

async function ensureSchema(env) {
  if (!env.DB || !env.UPLOADS) throw new Error("Study storage bindings are unavailable");
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
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
        author_email TEXT NOT NULL,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1
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
    ]).catch((error) => {
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
    subject: row.subject,
    tags,
    status: row.status,
    isPinned: Boolean(row.is_pinned),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,，]/);
  return [...new Set(list.map((tag) => cleanText(tag, 24)).filter(Boolean))].slice(0, 10);
}

function cleanText(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function validId(value) {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

function createSlug(isoDate) {
  return `${isoDate.slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
