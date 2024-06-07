CREATE TABLE `articles` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text(256) NOT NULL,
	`content` text NOT NULL,
	`summary` text(1024) NOT NULL,
	`image` text,
	`rank` integer DEFAULT 1 NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`language` text NOT NULL,
	`category` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `list_idx` ON `articles` (`category`,`language`,`rank`);