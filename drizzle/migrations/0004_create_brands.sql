CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  reasons TEXT,
  countries TEXT,
  categories TEXT,
  website TEXT,
  logo_url TEXT,
  alternatives TEXT,
  alternatives_text TEXT,
  stakeholders TEXT,
  created_at INTEGER NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at INTEGER NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS brand_name_idx ON brands(name);
CREATE INDEX IF NOT EXISTS brand_status_idx ON brands(status);
CREATE INDEX IF NOT EXISTS brand_entity_type_idx ON brands(entity_type); 