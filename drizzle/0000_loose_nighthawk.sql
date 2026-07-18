CREATE TABLE `application_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`field_label` text NOT NULL,
	`answer_text` text NOT NULL,
	`source_fact_ids_json` text DEFAULT '[]' NOT NULL,
	`confidence` integer DEFAULT 75 NOT NULL,
	`review_status` text DEFAULT 'needs_review' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `application_answers_application_idx` ON `application_answers` (`application_id`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`opportunity_id` text,
	`company_id` text,
	`role_title` text NOT NULL,
	`applied_at` text,
	`status` text DEFAULT 'drafting' NOT NULL,
	`next_step` text,
	`application_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `job_opportunities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `applications_user_idx` ON `applications` (`user_id`);--> statement-breakpoint
CREATE INDEX `applications_status_idx` ON `applications` (`status`);--> statement-breakpoint
CREATE TABLE `career_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_document_id` text,
	`category` text NOT NULL,
	`claim` text NOT NULL,
	`evidence` text NOT NULL,
	`confidence` integer DEFAULT 80 NOT NULL,
	`verification_status` text DEFAULT 'needs_review' NOT NULL,
	`reusable` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `career_facts_user_idx` ON `career_facts` (`user_id`);--> statement-breakpoint
CREATE INDEX `career_facts_category_idx` ON `career_facts` (`category`);--> statement-breakpoint
CREATE INDEX `career_facts_status_idx` ON `career_facts` (`verification_status`);--> statement-breakpoint
CREATE TABLE `career_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`headline` text NOT NULL,
	`target_roles_json` text DEFAULT '[]' NOT NULL,
	`target_markets_json` text DEFAULT '[]' NOT NULL,
	`positioning` text NOT NULL,
	`constraints_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `career_profiles_user_idx` ON `career_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website_url` text,
	`careers_url` text,
	`company_type` text NOT NULL,
	`primary_market` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `companies_name_idx` ON `companies` (`name`);--> statement-breakpoint
CREATE TABLE `company_monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`query` text NOT NULL,
	`cadence` text DEFAULT 'daily' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `company_monitors_user_idx` ON `company_monitors` (`user_id`);--> statement-breakpoint
CREATE INDEX `company_monitors_company_idx` ON `company_monitors` (`company_id`);--> statement-breakpoint
CREATE TABLE `content_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source_url` text NOT NULL,
	`source_type` text NOT NULL,
	`topic` text NOT NULL,
	`trust_level` text DEFAULT 'primary' NOT NULL,
	`last_checked_at` text,
	`refresh_cadence` text DEFAULT 'monthly' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_sources_topic_idx` ON `content_sources` (`topic`);--> statement-breakpoint
CREATE INDEX `content_sources_trust_idx` ON `content_sources` (`trust_level`);--> statement-breakpoint
CREATE TABLE `generated_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`application_id` text,
	`document_type` text NOT NULL,
	`storage_key` text,
	`source_fact_ids_json` text DEFAULT '[]' NOT NULL,
	`draft_text` text,
	`review_status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generated_documents_user_idx` ON `generated_documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `generated_documents_application_idx` ON `generated_documents` (`application_id`);--> statement-breakpoint
CREATE TABLE `job_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text,
	`title` text NOT NULL,
	`location` text,
	`source_url` text,
	`source_type` text NOT NULL,
	`raw_description_storage_key` text,
	`fit_score` integer,
	`fit_summary` text,
	`status` text DEFAULT 'lead' NOT NULL,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `job_opportunities_user_idx` ON `job_opportunities` (`user_id`);--> statement-breakpoint
CREATE INDEX `job_opportunities_company_idx` ON `job_opportunities` (`company_id`);--> statement-breakpoint
CREATE INDEX `job_opportunities_status_idx` ON `job_opportunities` (`status`);--> statement-breakpoint
CREATE TABLE `monitor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text,
	`source_id` text,
	`run_status` text NOT NULL,
	`found_count` integer DEFAULT 0 NOT NULL,
	`change_summary` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `company_monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `content_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `monitor_runs_monitor_idx` ON `monitor_runs` (`monitor_id`);--> statement-breakpoint
CREATE INDEX `monitor_runs_source_idx` ON `monitor_runs` (`source_id`);--> statement-breakpoint
CREATE TABLE `role_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`requirement_type` text NOT NULL,
	`requirement_text` text NOT NULL,
	`evidence_fact_ids_json` text DEFAULT '[]' NOT NULL,
	`match_strength` text DEFAULT 'unknown' NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `job_opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_requirements_opportunity_idx` ON `role_requirements` (`opportunity_id`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`storage_key` text,
	`original_url` text,
	`extracted_text_hash` text,
	`processing_status` text DEFAULT 'queued' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_documents_user_idx` ON `source_documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `source_documents_status_idx` ON `source_documents` (`processing_status`);--> statement-breakpoint
CREATE TABLE `style_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`tone_json` text DEFAULT '{}' NOT NULL,
	`phrases_to_prefer_json` text DEFAULT '[]' NOT NULL,
	`phrases_to_avoid_json` text DEFAULT '[]' NOT NULL,
	`example_edits_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `style_profiles_user_idx` ON `style_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`default_market` text DEFAULT 'San Francisco Bay Area' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `writing_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`sample_type` text NOT NULL,
	`storage_key` text,
	`approved_for_style` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `writing_samples_user_idx` ON `writing_samples` (`user_id`);