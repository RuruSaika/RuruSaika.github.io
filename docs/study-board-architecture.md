# Blog architecture

The Blog is intentionally separated into four replaceable layers so a future
portfolio redesign does not endanger the accumulated articles.

## Boundaries

- `study/` is the presentation layer. The path is retained for URL and storage
  compatibility, while the product presented there is Ruru's general Blog. It
  contains the public index, article reader, private editor, and a small
  Markdown renderer.
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
  back to publication date until the first reorder is saved.
- R2 stores uploaded images. Markdown refers to images through portable
  `asset://<id>` tokens rather than deployment-specific URLs.

## Portability

The editor exposes a JSON export containing every post and all image metadata.
Image bytes remain in R2 and are addressed by durable asset IDs. The public UI
can be replaced independently as long as it consumes the documented API shape.

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
