DROP INDEX `uq_preset_events_dedupe`;--> statement-breakpoint
ALTER TABLE `preset_events` ADD `target_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_events_dedupe` ON `preset_events` (`preset_id`,`kind`,`actor_hash`,`dedupe_bucket`,`target_key`);
