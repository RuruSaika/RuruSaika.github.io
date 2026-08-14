CREATE TABLE study_posts_hidden_migration (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '其他',
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  author_email TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE study_assets_hidden_migration (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES study_posts_hidden_migration(id) ON DELETE SET NULL
);

INSERT INTO study_posts_hidden_migration (
  id, slug, title, summary, content, subject, tags_json, status,
  author_email, published_at, created_at, updated_at
)
SELECT
  id, slug, title, summary, content, subject, tags_json,
  CASE WHEN status = 'archived' THEN 'hidden' ELSE status END,
  author_email, published_at, created_at, updated_at
FROM study_posts;

INSERT INTO study_assets_hidden_migration (
  id, post_id, r2_key, original_name, content_type, size_bytes, alt_text, created_at
)
SELECT
  id, post_id, r2_key, original_name, content_type, size_bytes, alt_text, created_at
FROM study_assets;

DROP TABLE study_assets;
DROP TABLE study_posts;
ALTER TABLE study_posts_hidden_migration RENAME TO study_posts;
ALTER TABLE study_assets_hidden_migration RENAME TO study_assets;

CREATE INDEX idx_study_posts_status_published_at
ON study_posts(status, published_at DESC);

CREATE INDEX idx_study_posts_subject_status
ON study_posts(subject, status);

CREATE INDEX idx_study_assets_post_id
ON study_assets(post_id);

PRAGMA optimize;
