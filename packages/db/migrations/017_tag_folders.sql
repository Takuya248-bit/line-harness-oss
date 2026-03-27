-- 017: Tag folders for organizing tags (タグフォルダ機能)

CREATE TABLE tag_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  line_account_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tags ADD COLUMN folder_id TEXT REFERENCES tag_folders(id);

CREATE INDEX idx_tag_folders_account ON tag_folders(line_account_id);
CREATE INDEX idx_tags_folder ON tags(folder_id);
