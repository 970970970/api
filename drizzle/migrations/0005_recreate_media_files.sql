-- 删除旧表
DROP TABLE IF EXISTS media_files;

-- 创建新表
CREATE TABLE media_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER,
  description TEXT,
  upload_time INTEGER NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 创建索引
CREATE INDEX upload_time_idx ON media_files(upload_time); 