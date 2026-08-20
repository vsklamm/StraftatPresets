CREATE TABLE `game_maps` (
	`name` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_game_maps_active_name` ON `game_maps` (`is_active`,`name`);--> statement-breakpoint
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
	`image_path` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_game_weapons_active_name` ON `game_weapons` (`is_active`,`name`);--> statement-breakpoint
CREATE TABLE `likes` (
	`preset_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`preset_id`, `user_id`),
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `map_playlist_maps` (
	`map_playlist_id` text NOT NULL,
	`position` integer NOT NULL,
	`map_name` text NOT NULL,
	PRIMARY KEY(`map_playlist_id`, `position`),
	FOREIGN KEY (`map_playlist_id`) REFERENCES `map_playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_name`) REFERENCES `game_maps`(`name`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_map_playlist_maps_name` ON `map_playlist_maps` (`map_name`);--> statement-breakpoint
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
	`preset_version_id` text,
	`kind` text NOT NULL,
	`actor_hash` text NOT NULL,
	`network_hash` text,
	`is_authenticated` integer DEFAULT false NOT NULL,
	`client_event_id` text,
	`dedupe_bucket` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`is_invalidated` integer DEFAULT false NOT NULL,
	`invalidated_at` integer,
	`invalidated_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preset_version_id`) REFERENCES `preset_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_events_dedupe` ON `preset_events` (`preset_id`,`kind`,`actor_hash`,`dedupe_bucket`,`target`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_preset_events_client_event` ON `preset_events` (`preset_id`,`client_event_id`);--> statement-breakpoint
CREATE INDEX `idx_preset_events_ranking` ON `preset_events` (`preset_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_preset_events_network` ON `preset_events` (`preset_id`,`kind`,`network_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `preset_like_events` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`network_hash` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_preset_like_events_user_created` ON `preset_like_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_preset_like_events_network_created` ON `preset_like_events` (`preset_id`,`network_hash`,`created_at`);--> statement-breakpoint
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
CREATE TABLE `preset_statistics` (
	`preset_id` text PRIMARY KEY NOT NULL,
	`likes_count` integer DEFAULT 0 NOT NULL,
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
CREATE INDEX `idx_preset_statistics_ranking` ON `preset_statistics` (`quality_score_milli`,`engagement_score_milli`);--> statement-breakpoint
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
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`event_count` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`preset_id`, `kind`, `actor_hash`),
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_preset_unique_actors_counts` ON `preset_unique_actors` (`preset_id`,`kind`,`is_authenticated`);--> statement-breakpoint
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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_presets_slug` ON `presets` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_presets_author_id` ON `presets` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_presets_status_published_at` ON `presets` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `randomized_weapons` (
	`id` text PRIMARY KEY NOT NULL,
	`weapon_configuration_id` text NOT NULL,
	`weapon_name` text NOT NULL,
	`weight` integer NOT NULL,
	FOREIGN KEY (`weapon_configuration_id`) REFERENCES `weapon_configurations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`weapon_name`) REFERENCES `game_weapons`(`name`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_randomized_weapons_config_name` ON `randomized_weapons` (`weapon_configuration_id`,`weapon_name`);--> statement-breakpoint
CREATE INDEX `idx_randomized_weapons_config_id` ON `randomized_weapons` (`weapon_configuration_id`);--> statement-breakpoint
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
CREATE TRIGGER `randomized_weapons_require_active_weapon_insert`
BEFORE INSERT ON `randomized_weapons`
WHEN NOT EXISTS (SELECT 1 FROM `game_weapons` WHERE `name` = NEW.`weapon_name` AND `is_active` = 1)
BEGIN
	SELECT RAISE(ABORT, 'weapon is not supported by the current STRAFTAT catalog');
END;
--> statement-breakpoint
CREATE TRIGGER `randomized_weapons_require_active_weapon_update`
BEFORE UPDATE OF `weapon_name` ON `randomized_weapons`
WHEN NOT EXISTS (SELECT 1 FROM `game_weapons` WHERE `name` = NEW.`weapon_name` AND `is_active` = 1)
BEGIN
	SELECT RAISE(ABORT, 'weapon is not supported by the current STRAFTAT catalog');
END;
--> statement-breakpoint
CREATE TRIGGER `map_playlist_maps_require_active_map_insert`
BEFORE INSERT ON `map_playlist_maps`
WHEN NOT EXISTS (SELECT 1 FROM `game_maps` WHERE `name` = NEW.`map_name` AND `is_active` = 1)
BEGIN
	SELECT RAISE(ABORT, 'map is not supported by the current STRAFTAT catalog');
END;
--> statement-breakpoint
CREATE TRIGGER `map_playlist_maps_require_active_map_update`
BEFORE UPDATE OF `map_name` ON `map_playlist_maps`
WHEN NOT EXISTS (SELECT 1 FROM `game_maps` WHERE `name` = NEW.`map_name` AND `is_active` = 1)
BEGIN
	SELECT RAISE(ABORT, 'map is not supported by the current STRAFTAT catalog');
END;
--> statement-breakpoint
CREATE TRIGGER `preset_tags_touch_ranking_insert`
AFTER INSERT ON `preset_tags`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` = NEW.`preset_id`;
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` = NEW.`preset_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `preset_tags_touch_ranking_update`
AFTER UPDATE ON `preset_tags`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` IN (OLD.`preset_id`, NEW.`preset_id`);
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` IN (OLD.`preset_id`, NEW.`preset_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `preset_tags_touch_ranking_delete`
AFTER DELETE ON `preset_tags`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` = OLD.`preset_id`;
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` = OLD.`preset_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `preset_versions_touch_ranking_insert`
AFTER INSERT ON `preset_versions`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` = NEW.`preset_id`;
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` = NEW.`preset_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `preset_versions_touch_ranking_update`
AFTER UPDATE ON `preset_versions`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` IN (OLD.`preset_id`, NEW.`preset_id`);
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` IN (OLD.`preset_id`, NEW.`preset_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `preset_versions_touch_ranking_delete`
AFTER DELETE ON `preset_versions`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` = OLD.`preset_id`;
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` = OLD.`preset_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `map_playlists_touch_ranking_insert`
AFTER INSERT ON `map_playlists`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` = (SELECT `preset_id` FROM `preset_versions` WHERE `id` = NEW.`preset_version_id`);
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` = (SELECT `preset_id` FROM `preset_versions` WHERE `id` = NEW.`preset_version_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `map_playlists_touch_ranking_update`
AFTER UPDATE ON `map_playlists`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` IN (SELECT `preset_id` FROM `preset_versions` WHERE `id` IN (OLD.`preset_version_id`, NEW.`preset_version_id`));
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` IN (SELECT `preset_id` FROM `preset_versions` WHERE `id` IN (OLD.`preset_version_id`, NEW.`preset_version_id`));
END;
--> statement-breakpoint
CREATE TRIGGER `map_playlists_touch_ranking_delete`
AFTER DELETE ON `map_playlists`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` = (SELECT `preset_id` FROM `preset_versions` WHERE `id` = OLD.`preset_version_id`);
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` = (SELECT `preset_id` FROM `preset_versions` WHERE `id` = OLD.`preset_version_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `weapon_configurations_touch_ranking_insert`
AFTER INSERT ON `weapon_configurations`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` = (SELECT `preset_id` FROM `preset_versions` WHERE `id` = NEW.`preset_version_id`);
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` = (SELECT `preset_id` FROM `preset_versions` WHERE `id` = NEW.`preset_version_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `weapon_configurations_touch_ranking_update`
AFTER UPDATE ON `weapon_configurations`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` IN (SELECT `preset_id` FROM `preset_versions` WHERE `id` IN (OLD.`preset_version_id`, NEW.`preset_version_id`));
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` IN (SELECT `preset_id` FROM `preset_versions` WHERE `id` IN (OLD.`preset_version_id`, NEW.`preset_version_id`));
END;
--> statement-breakpoint
CREATE TRIGGER `weapon_configurations_touch_ranking_delete`
AFTER DELETE ON `weapon_configurations`
BEGIN
	UPDATE `presets` SET `updated_at` = unixepoch() * 1000 WHERE `id` = (SELECT `preset_id` FROM `preset_versions` WHERE `id` = OLD.`preset_version_id`);
	UPDATE `preset_statistics` SET `quality_score_milli` = 0 WHERE `preset_id` = (SELECT `preset_id` FROM `preset_versions` WHERE `id` = OLD.`preset_version_id`);
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
