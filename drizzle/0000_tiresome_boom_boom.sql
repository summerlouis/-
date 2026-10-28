CREATE TABLE `product_prices` (
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`cents` integer NOT NULL,
	`active` integer NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `code`)
);
