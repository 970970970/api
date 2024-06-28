CREATE TABLE `media_files` (
	`id` integer PRIMARY KEY NOT NULL,
	`type_id` integer NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer,
	`description` text,
	`upload_time` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
/*
 SQLite does not support "Changing existing column type" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE `articles` ADD `origin_id` integer;--> statement-breakpoint
CREATE INDEX `type_id_idx` ON `media_files` (`type_id`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `media_files` (`name`);--> statement-breakpoint
CREATE INDEX `upload_time_idx` ON `media_files` (`upload_time`);--> statement-breakpoint
CREATE INDEX `origin_idx` ON `articles` (`origin_id`);