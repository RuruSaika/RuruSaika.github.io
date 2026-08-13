import pathlib
import sqlite3


repository_root = pathlib.Path(__file__).resolve().parent.parent
connection = sqlite3.connect(":memory:")

for name in (
    "0001_study_board.sql",
    "0002_blog_sort_order.sql",
    "0003_drop_study_post_revision.sql",
    "0004_homepage_sort_setting.sql",
):
    connection.executescript((repository_root / "drizzle" / name).read_text(encoding="utf-8"))

columns = [row[1] for row in connection.execute("PRAGMA table_info(study_posts)")]
setting = connection.execute(
    "SELECT value FROM study_settings WHERE key = 'homepage_sort'"
).fetchone()[0]

assert "sort_order" not in columns
assert "is_pinned" not in columns
assert "revision" not in columns
assert setting == "updated_at"
print("Database migration tests passed.")
