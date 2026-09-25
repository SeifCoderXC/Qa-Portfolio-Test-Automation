ALTER TABLE `bugs` ADD `classification` text DEFAULT 'product_bug' NOT NULL;--> statement-breakpoint
ALTER TABLE `bugs` ADD `created_at` integer;--> statement-breakpoint
ALTER TABLE `results` ADD `classification` text;--> statement-breakpoint
ALTER TABLE `results` ADD `analysis` text;