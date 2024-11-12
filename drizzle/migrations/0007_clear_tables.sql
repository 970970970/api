DELETE FROM brands;
DELETE FROM media_files;
-- 重置自增 ID
DELETE FROM sqlite_sequence WHERE name='brands' OR name='media_files'; 