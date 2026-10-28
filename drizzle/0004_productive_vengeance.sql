CREATE TABLE `catalog_images` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_images_object_key` ON `catalog_images` (`object_key`);--> statement-breakpoint
ALTER TABLE `catalog_products` ADD `image_id` text;--> statement-breakpoint
ALTER TABLE `product_prices` ADD `image_id` text;