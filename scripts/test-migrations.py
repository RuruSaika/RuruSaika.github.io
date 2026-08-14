import pathlib
import sqlite3


repository_root = pathlib.Path(__file__).resolve().parent.parent
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")

for name in (
    "0001_study_board.sql",
    "0002_blog_sort_order.sql",
    "0003_drop_study_post_revision.sql",
    "0004_homepage_sort_setting.sql",
):
    connection.executescript((repository_root / "drizzle" / name).read_text(encoding="utf-8"))

connection.execute(
    """
    INSERT INTO study_posts (
      id, slug, title, summary, content, subject, tags_json, status,
      author_email, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, '', '', '其它', '[]', 'archived', ?, NULL, ?, ?)
    """,
    ("legacy-post", "legacy-post", "Legacy post", "owner@example.com", "2026-08-01", "2026-08-02"),
)
connection.execute(
    """
    INSERT INTO study_assets (
      id, post_id, r2_key, original_name, content_type, size_bytes, alt_text, created_at
    ) VALUES (?, ?, ?, ?, 'image/png', 1, '', ?)
    """,
    ("legacy-asset", "legacy-post", "study/legacy.png", "legacy.png", "2026-08-01"),
)
connection.executescript(
    (repository_root / "drizzle" / "0005_replace_archive_with_hidden.sql").read_text(encoding="utf-8")
)

columns = [row[1] for row in connection.execute("PRAGMA table_info(study_posts)")]
setting = connection.execute(
    "SELECT value FROM study_settings WHERE key = 'homepage_sort'"
).fetchone()[0]
statuses = connection.execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'study_posts'"
).fetchone()[0]
legacy_status = connection.execute(
    "SELECT status FROM study_posts WHERE id = 'legacy-post'"
).fetchone()[0]
legacy_asset_post = connection.execute(
    "SELECT post_id FROM study_assets WHERE id = 'legacy-asset'"
).fetchone()[0]
foreign_key_errors = list(connection.execute("PRAGMA foreign_key_check"))

assert "sort_order" not in columns
assert "is_pinned" not in columns
assert "revision" not in columns
assert setting == "updated_at"
assert "'hidden'" in statuses
assert "'archived'" not in statuses
assert legacy_status == "hidden"
assert legacy_asset_post == "legacy-post"
assert foreign_key_errors == []
print("Database migration tests passed.")
