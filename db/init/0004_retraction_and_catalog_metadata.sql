ALTER TABLE `presets` ADD `resubmission_blocked_until` integer;--> statement-breakpoint
ALTER TABLE `presets` ADD `retracted_at` integer;--> statement-breakpoint
ALTER TABLE `presets` ADD `retracted_reason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_until` integer;