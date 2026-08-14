# Blog architecture

The Blog is intentionally separated into four replaceable layers so a future
portfolio redesign does not endanger the accumulated articles.

## Boundaries

- The public Blog presentation is part of the root personal site. `index.html`
  contains the article index and unified reader view. On the Sites origin,
  `static/js/blog.js` consumes the live public API. On GitHub Pages it reads the
  same-origin `static/blog/posts.json` snapshot, so visitors do not depend on
  the Sites origin.
- `study/` is retained only for the private editor, shared Markdown renderer,
  and editor-specific styles. The old public Blog paths are intentionally not
  kept as compatibility routes.
- `worker/index.js` is the API and authorization boundary. Public routes are
  read-only; every write route verifies the signed-in ChatGPT user server-side
  against the configured owner email.
- D1 is the durable content store. Posts are Markdown records with stable IDs,
  slugs, status, timestamps, category, and tags. The existing
  `subject` field is kept as an internal compatibility boundary; the public
  categories are `生活`, `学习`, and `其它`, and legacy study subjects normalize
  to `学习` without destructive data migration.
- The editor owns one global `homepage_sort` setting, stored in `study_settings`.
  It currently accepts `published_at` or `updated_at`, and the public Blog applies
  the selected timestamp in reverse chronological order. Visitors cannot override
  the choice locally. Article-level `sort_order` and legacy `is_pinned` data have
  been removed.
- R2 stores uploaded images. Markdown refers to images through portable
  `asset://<id>` tokens rather than deployment-specific URLs.

## Public mirror

- `scripts/sync-public-blog.mjs` reads only published API routes, downloads
  referenced R2 images, rewrites their portable tokens to same-origin static
  paths, and writes a stable snapshot under `static/blog/`.
- Publishing, unpublishing, archiving, deleting, or changing the homepage sort asks
  GitHub Actions to run the mirror immediately. The API Worker keeps the
  fine-grained GitHub token in the server-only `GITHUB_SYNC_TOKEN` secret; the
  editor never receives it. The token only needs Actions read/write access to
  `RuruSaika/RuruSaika.github.io`.
- `.github/workflows/sync-blog.yml` accepts the publish-time
  `workflow_dispatch` event and also runs hourly at minute 17 as a recovery
  path. It commits only when the snapshot changes, then requests a GitHub Pages
  rebuild. GitHub's scheduled event is fallback recovery rather than the normal
  publication path.
- A failed sync stops before replacing `posts.json`, so GitHub Pages keeps the
  last successfully mirrored public content.
- Article publishing remains a single action in the private editor. A failed
  dispatch does not roll back the canonical D1 write; the editor shows a warning
  and the hourly recovery run retries the mirror later. GitHub remains a
  read-only public snapshot rather than a second content store.

## Portability

The editor exposes a JSON export containing every post and all image metadata.
Canonical image bytes remain in R2 and are addressed by durable asset IDs; the
GitHub mirror contains public copies only. The public UI can be replaced
independently as long as it consumes the documented API or snapshot shape.

## Access model

The public Blog can be read anonymously. The editor lives on the Sites origin
and uses dispatch-owned ChatGPT sign-in. Write endpoints require both forwarded
identity headers and an exact match with the server-side `ADMIN_EMAIL` value.
Client-side hiding is never treated as authorization.

## Content lifecycle

- `draft`: visible only in the editor.
- `published`: visible through public APIs and the public board.
- `hidden`: omitted from public listings and article pages, but remains visible
  and editable in the editor and is retained in exports.
- Permanent deletion is an owner-only, same-origin `DELETE` operation. It removes
  the post from D1 and deletes its linked or Markdown-referenced image objects
  from both D1 and R2 after an explicit two-step confirmation in the editor.

Schema changes must be introduced as new files under `drizzle/`; never rewrite
an already-deployed migration.
