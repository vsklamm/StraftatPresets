ALTER TABLE `preset_revisions` ADD `telegram_chat_id` text;--> statement-breakpoint
ALTER TABLE `preset_revisions` ADD `telegram_message_id` integer;--> statement-breakpoint
ALTER TABLE `preset_revisions` ADD `telegram_message_kind` text;--> statement-breakpoint
ALTER TABLE `preset_revisions` ADD `telegram_message_html` text;--> statement-breakpoint
ALTER TABLE `preset_revisions` ADD `telegram_decision` text;--> statement-breakpoint
ALTER TABLE `preset_revisions` ADD `telegram_resolved_at` integer;