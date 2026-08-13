/**
 * Canonical data contract for the study board.
 *
 * Runtime queries currently use the raw D1 binding so the static portfolio
 * remains framework-independent. Keep this model aligned with migrations in
 * /drizzle whenever the storage shape evolves.
 */
export type StudyPostStatus = "draft" | "published" | "archived";
export type BlogCategory = "生活" | "学习" | "其它";
export type LegacyStudySubject = "数学" | "英语" | "政治" | "专业课" | "复盘" | "其他";
export type StudySubject = BlogCategory | LegacyStudySubject;

export interface StudyPostRecord {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  subject: StudySubject;
  tags_json: string;
  status: StudyPostStatus;
  /** @deprecated Manual sort_order is the authoritative presentation order. */
  is_pinned: 0 | 1;
  sort_order: number;
  author_email: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyAssetRecord {
  id: string;
  post_id: string | null;
  r2_key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  alt_text: string;
  created_at: string;
}
