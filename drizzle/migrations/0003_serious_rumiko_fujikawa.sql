CREATE TABLE `languages` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`flag` text NOT NULL,
	`status` integer DEFAULT 1 NOT NULL
);
