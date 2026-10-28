CREATE TABLE `catalog_products` (
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`category` text NOT NULL,
	`dish` text NOT NULL,
	`fr` text NOT NULL,
	`cents` integer NOT NULL,
	`active` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `code`)
);
