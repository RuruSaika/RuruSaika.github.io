CREATE TABLE IF NOT EXISTS study_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO study_settings (key, value, updated_at)
VALUES ('homepage_sort', 'updated_at', CURRENT_TIMESTAMP);

DROP INDEX IF EXISTS idx_study_posts_sort_order;

ALTER TABLE study_posts DROP COLUMN sort_order;
ALTER TABLE study_posts DROP COLUMN is_pinned;

PRAGMA optimize;
