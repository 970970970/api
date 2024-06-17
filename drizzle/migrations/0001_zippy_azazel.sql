CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`two_factor_secret` text,
	`status` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `username_idx` ON `admin_users` (`email`);