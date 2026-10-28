CREATE TABLE `sales_closures` (
	`user_id` text NOT NULL,
	`month` text NOT NULL,
	`closed_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text NOT NULL,
	`month` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_user_order` ON `sales` (`user_id`,`order_id`);