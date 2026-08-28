CREATE TABLE `game_maps` (
	`name` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`family` text NOT NULL,
	`is_dlc` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_game_maps_active_name` ON `game_maps` (`is_active`,`name`);--> statement-breakpoint
CREATE INDEX `idx_game_maps_family` ON `game_maps` (`family`);--> statement-breakpoint
CREATE TABLE `game_releases` (
	`version` text PRIMARY KEY NOT NULL,
	`published_at` text NOT NULL,
	`source_url` text NOT NULL,
	`catalog_hash` text NOT NULL,
	`is_supported` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_game_releases_supported` ON `game_releases` (`is_supported`);--> statement-breakpoint
CREATE TABLE `game_weapons` (
	`name` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`image_path` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_game_weapons_active_name` ON `game_weapons` (`is_active`,`name`);--> statement-breakpoint
CREATE INDEX `idx_game_weapons_game_id` ON `game_weapons` (`game_id`);--> statement-breakpoint
CREATE TABLE `map_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_version_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`encoded_value` text NOT NULL,
	`decoded_map_count` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`preset_version_id`) REFERENCES `preset_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_map_playlists_version_id` ON `map_playlists` (`preset_version_id`);--> statement-breakpoint
CREATE TABLE `preset_abuse_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`day_bucket` text NOT NULL,
	`actor_hash` text DEFAULT '' NOT NULL,
	`network_hash` text DEFAULT '' NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_abuse_signal_group` ON `preset_abuse_signals` (`preset_id`,`kind`,`reason`,`day_bucket`,`actor_hash`,`network_hash`);--> statement-breakpoint
CREATE INDEX `idx_preset_abuse_signals_admin` ON `preset_abuse_signals` (`preset_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `preset_events` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_hash` text NOT NULL,
	`network_hash` text,
	`is_authenticated` integer DEFAULT false NOT NULL,
	`client_event_id` text,
	`target_key` text DEFAULT '' NOT NULL,
	`dedupe_bucket` text NOT NULL,
	`is_invalidated` integer DEFAULT false NOT NULL,
	`invalidated_at` integer,
	`invalidated_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_events_dedupe` ON `preset_events` (`preset_id`,`kind`,`actor_hash`,`dedupe_bucket`,`target_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_events_client_event` ON `preset_events` (`preset_id`,`client_event_id`);--> statement-breakpoint
CREATE INDEX `idx_preset_events_network` ON `preset_events` (`preset_id`,`kind`,`network_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `preset_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`source_revision_id` text,
	`status` text NOT NULL,
	`content_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`validation_issues_json` text DEFAULT '[]' NOT NULL,
	`review_issues_json` text DEFAULT '[]' NOT NULL,
	`edit_version` integer DEFAULT 0 NOT NULL,
	`submitted_at` integer,
	`reviewed_at` integer,
	`reviewer_id` text,
	`telegram_chat_id` text,
	`telegram_message_id` integer,
	`telegram_message_kind` text,
	`telegram_message_html` text,
	`telegram_decision` text,
	`telegram_resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "preset_revisions_status_valid" CHECK("preset_revisions"."status" IN ('draft', 'pending', 'rejected', 'published', 'archived', 'superseded')),
	CONSTRAINT "preset_revisions_content_valid" CHECK(json_valid("preset_revisions"."content_json") AND length("preset_revisions"."content_json") <= 900000),
	CONSTRAINT "preset_revisions_issues_valid" CHECK(json_valid("preset_revisions"."validation_issues_json") AND json_valid("preset_revisions"."review_issues_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_revisions_number` ON `preset_revisions` (`preset_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_revisions_working` ON `preset_revisions` (`preset_id`) WHERE "preset_revisions"."status" in ('draft', 'pending', 'rejected');--> statement-breakpoint
CREATE INDEX `idx_preset_revisions_moderation_queue` ON `preset_revisions` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_preset_revisions_source` ON `preset_revisions` (`source_revision_id`);--> statement-breakpoint
CREATE TABLE `preset_search_documents` (
	`preset_id` text PRIMARY KEY NOT NULL,
	`published_revision_id` text NOT NULL,
	`schema_version` integer NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`description` text NOT NULL,
	`secondary_text` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_search_documents_revision` ON `preset_search_documents` (`published_revision_id`);--> statement-breakpoint
CREATE INDEX `idx_preset_search_documents_schema` ON `preset_search_documents` (`schema_version`);--> statement-breakpoint
CREATE TABLE `preset_search_terms` (
	`preset_id` text NOT NULL,
	`published_revision_id` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`preset_id`, `field`, `value`),
	FOREIGN KEY (`preset_id`) REFERENCES `preset_search_documents`(`preset_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_preset_search_terms_lookup` ON `preset_search_terms` (`field`,`value`,`preset_id`);--> statement-breakpoint
CREATE INDEX `idx_preset_search_terms_revision` ON `preset_search_terms` (`published_revision_id`);--> statement-breakpoint
CREATE TABLE `preset_statistics` (
	`preset_id` text PRIMARY KEY NOT NULL,
	`views_total` integer DEFAULT 0 NOT NULL,
	`views_unique_anonymous` integer DEFAULT 0 NOT NULL,
	`views_unique_authenticated` integer DEFAULT 0 NOT NULL,
	`link_opens_total` integer DEFAULT 0 NOT NULL,
	`link_opens_unique_anonymous` integer DEFAULT 0 NOT NULL,
	`link_opens_unique_authenticated` integer DEFAULT 0 NOT NULL,
	`copies_total` integer DEFAULT 0 NOT NULL,
	`copies_unique_anonymous` integer DEFAULT 0 NOT NULL,
	`copies_unique_authenticated` integer DEFAULT 0 NOT NULL,
	`quality_score_milli` integer DEFAULT 0 NOT NULL,
	`engagement_score_milli` integer DEFAULT 0 NOT NULL,
	`abuse_signal_count` integer DEFAULT 0 NOT NULL,
	`last_engagement_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preset_tags` (
	`preset_id` text NOT NULL,
	`tag_slug` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`preset_id`, `tag_slug`),
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_slug`) REFERENCES `tags`(`slug`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_tags_position` ON `preset_tags` (`preset_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_preset_tags_tag_slug` ON `preset_tags` (`tag_slug`);--> statement-breakpoint
CREATE TABLE `preset_unique_actors` (
	`preset_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_hash` text NOT NULL,
	`is_authenticated` integer NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`preset_id`, `kind`, `actor_hash`),
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preset_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_versions_preset_label` ON `preset_versions` (`preset_id`,`label`);--> statement-breakpoint
CREATE INDEX `idx_preset_versions_preset_id` ON `preset_versions` (`preset_id`);--> statement-breakpoint
CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`thumbnail_key` text,
	`thumbnail_moderation_status` text DEFAULT 'not_submitted' NOT NULL,
	`thumbnail_moderation_data` text,
	`thumbnail_moderated_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`working_revision_id` text,
	`published_revision_id` text,
	`revision_counter` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`resubmission_blocked_until` integer,
	`retracted_at` integer,
	`retracted_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_presets_slug` ON `presets` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_presets_author_id` ON `presets` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_presets_status_published_at` ON `presets` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`slug` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tags_label` ON `tags` (`label`);--> statement-breakpoint
CREATE INDEX `idx_tags_active_sort` ON `tags` (`is_active`,`sort_order`,`label`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`suspended_until` integer,
	`last_login_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weapon_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_version_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`encoded_value` text,
	FOREIGN KEY (`preset_version_id`) REFERENCES `preset_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_weapon_configurations_version_id` ON `weapon_configurations` (`preset_version_id`);
--> statement-breakpoint
CREATE TRIGGER `preset_tags_max_eight`
BEFORE INSERT ON `preset_tags`
WHEN (SELECT COUNT(*) FROM `preset_tags` WHERE `preset_id` = NEW.`preset_id`) >= 8
BEGIN
	SELECT RAISE(ABORT, 'a preset can have at most 8 tags');
END;
--> statement-breakpoint
CREATE TRIGGER `preset_revisions_require_valid_transition`
BEFORE UPDATE OF `status` ON `preset_revisions`
WHEN OLD.`status` <> NEW.`status` AND NOT (
	(OLD.`status` = 'draft' AND NEW.`status` IN ('pending', 'superseded')) OR
	(OLD.`status` = 'pending' AND NEW.`status` IN ('rejected', 'published', 'superseded')) OR
	(OLD.`status` = 'rejected' AND NEW.`status` = 'superseded') OR
	(OLD.`status` = 'published' AND NEW.`status` = 'archived')
)
BEGIN
	SELECT RAISE(ABORT, 'invalid preset revision transition');
END;
--> statement-breakpoint
CREATE TRIGGER `preset_revisions_keep_submitted_content_immutable`
BEFORE UPDATE OF `content_json`, `content_hash` ON `preset_revisions`
WHEN OLD.`status` <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'only draft revision content can be edited');
END;
--> statement-breakpoint
CREATE TRIGGER `presets_require_working_revision_ownership`
BEFORE UPDATE OF `working_revision_id` ON `presets`
WHEN NEW.`working_revision_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `preset_revisions`
	WHERE `id` = NEW.`working_revision_id`
		AND `preset_id` = NEW.`id`
		AND `status` IN ('draft', 'pending', 'rejected')
)
BEGIN
	SELECT RAISE(ABORT, 'working revision must belong to the preset and remain editable');
END;
--> statement-breakpoint
CREATE TRIGGER `presets_require_published_revision_ownership`
BEFORE UPDATE OF `published_revision_id` ON `presets`
WHEN NEW.`published_revision_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `preset_revisions`
	WHERE `id` = NEW.`published_revision_id`
		AND `preset_id` = NEW.`id`
		AND `status` = 'published'
)
BEGIN
	SELECT RAISE(ABORT, 'published revision must belong to the preset and be published');
END;
--> statement-breakpoint
CREATE TRIGGER `presets_require_published_revision`
BEFORE UPDATE OF `status` ON `presets`
WHEN NEW.`status` = 'published' AND OLD.`status` <> 'published' AND NEW.`published_revision_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'published preset needs an approved revision');
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE `preset_search_fts` USING fts5(
	`preset_id` UNINDEXED,
	`title`,
	`author`,
	`description`,
	`secondary_text`,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `preset_search_documents_fts_insert`
AFTER INSERT ON `preset_search_documents`
BEGIN
	INSERT INTO `preset_search_fts` (`preset_id`, `title`, `author`, `description`, `secondary_text`)
	VALUES (NEW.`preset_id`, NEW.`title`, NEW.`author`, NEW.`description`, NEW.`secondary_text`);
END;
--> statement-breakpoint
CREATE TRIGGER `preset_search_documents_fts_update`
AFTER UPDATE OF `title`, `author`, `description`, `secondary_text` ON `preset_search_documents`
BEGIN
	DELETE FROM `preset_search_fts` WHERE `preset_id` = OLD.`preset_id`;
	INSERT INTO `preset_search_fts` (`preset_id`, `title`, `author`, `description`, `secondary_text`)
	VALUES (NEW.`preset_id`, NEW.`title`, NEW.`author`, NEW.`description`, NEW.`secondary_text`);
END;
--> statement-breakpoint
CREATE TRIGGER `preset_search_documents_fts_delete`
AFTER DELETE ON `preset_search_documents`
BEGIN
	DELETE FROM `preset_search_fts` WHERE `preset_id` = OLD.`preset_id`;
END;
