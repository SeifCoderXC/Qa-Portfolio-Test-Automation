CREATE TABLE `app_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_maps_project_idx` ON `app_maps` (`project_id`);--> statement-breakpoint
CREATE TABLE `bugs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`result_id` text,
	`title` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`analysis` text,
	`status` text DEFAULT 'open' NOT NULL,
	`jira_key` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bugs_project_idx` ON `bugs` (`project_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `evidence_result_idx` ON `evidence` (`result_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`locked_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_status_created_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`case_id` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer,
	`error_text` text,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `results_run_idx` ON `results` (`run_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `test_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `runs_project_idx` ON `runs` (`project_id`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`value_enc` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `secrets_project_idx` ON `secrets` (`project_id`);--> statement-breakpoint
CREATE TABLE `test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`case_key` text NOT NULL,
	`title` text NOT NULL,
	`objective` text,
	`preconditions` text,
	`steps_json` text NOT NULL,
	`expected` text,
	`severity` text DEFAULT 'medium' NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `test_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `test_cases_plan_idx` ON `test_cases` (`plan_id`);--> statement-breakpoint
CREATE TABLE `test_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `test_plans_project_idx` ON `test_plans` (`project_id`);