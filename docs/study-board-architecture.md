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
  slugs, status, revision, timestamps, category, and tags. The existing
  `subject` field is kept as an internal compatibility boundary; the public
  categories are `生活`, `学习`, and `其它`, and legacy study subjects normalize
  to `学习` without destructive data migration.
- Manual article order is stored in the `sort_order` column. The private editor
  persists the complete active-post order through an owner-only reorder endpoint.
  The public Blog defaults to this manual order and can switch locally to pure
  reverse publication-date order. Rows without an assigned manual position fall
  back to publication date until the first reorder is saved. The merged homepage
  keeps this switch without changing the stored order.
- The legacy `is_pinned` column is retained for storage and API compatibility,
  but it no longer controls presentation order. Manual ordering is the single
  authoritative way to place an article at the top of the Blog.
- R2 stores uploaded images. Markdown refers to images through portable
  `asset://<id>` tokens rather than deployment-specific URLs.

## Public mirror

- `scripts/sync-public-blog.mjs` reads only published API routes, downloads
  referenced R2 images, rewrites their portable tokens to same-origin static
  paths, and writes a stable snapshot under `static/blog/`.
- `.github/workflows/sync-blog.yml` runs the mirror every ten minutes and can
  also be started manually. It commits only when the snapshot changes, then
  requests a GitHub Pages rebuild.
- A failed sync stops before replacing `posts.json`, so GitHub Pages keeps the
  last successfully mirrored public content.
- Article publishing remains a single action in the private editor. The mirror
  is eventual and does not make GitHub a second writable content store.

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
- `archived`: hidden from both public listings and the normal editor list, but
  retained in storage and included in exports.
- Permanent deletion is an owner-only, same-origin `DELETE` operation. It removes
  the post from D1 and deletes its linked or Markdown-referenced image objects
  from both D1 and R2 after an explicit two-step confirmation in the editor.

Schema changes must be introduced as new files under `drizzle/`; never rewrite
an already-deployed migration.
