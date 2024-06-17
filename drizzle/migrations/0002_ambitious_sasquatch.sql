DROP INDEX IF EXISTS `username_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `username_idx` ON `admin_users` (`email`);