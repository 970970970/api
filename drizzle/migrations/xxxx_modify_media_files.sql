ALTER TABLE media_files DROP COLUMN type_id;
ALTER TABLE media_files DROP COLUMN name;
DROP INDEX type_id_idx;
DROP INDEX name_idx; 