ALTER TABLE study_posts
ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_study_posts_sort_order
ON study_posts(sort_order);

PRAGMA optimize;
