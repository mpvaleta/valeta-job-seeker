DROP TABLE `application_answers`;--> statement-breakpoint
DROP TABLE `applications`;--> statement-breakpoint
DROP TABLE `career_facts`;--> statement-breakpoint
DROP TABLE `content_sources`;--> statement-breakpoint
DROP TABLE `generated_documents`;--> statement-breakpoint
DROP TABLE `role_requirements`;--> statement-breakpoint
DROP TABLE `source_documents`;--> statement-breakpoint
DROP TABLE `style_profiles`;--> statement-breakpoint
DROP TABLE `writing_samples`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_monitor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text,
	`run_status` text NOT NULL,
	`found_count` integer DEFAULT 0 NOT NULL,
	`change_summary` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `company_monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_monitor_runs`("id", "monitor_id", "run_status", "found_count", "change_summary", "created_at") SELECT "id", "monitor_id", "run_status", "found_count", "change_summary", "created_at" FROM `monitor_runs`;--> statement-breakpoint
DROP TABLE `monitor_runs`;--> statement-breakpoint
ALTER TABLE `__new_monitor_runs` RENAME TO `monitor_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `monitor_runs_monitor_idx` ON `monitor_runs` (`monitor_id`);