CREATE TABLE IF NOT EXISTS study_posts (
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
);

CREATE TABLE IF NOT EXISTS study_assets (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES study_posts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_study_posts_status_published_at
ON study_posts(status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_study_posts_subject_status
ON study_posts(subject, status);

CREATE INDEX IF NOT EXISTS idx_study_assets_post_id
ON study_assets(post_id);

PRAGMA optimize;
