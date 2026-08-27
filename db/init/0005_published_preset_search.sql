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
CREATE VIRTUAL TABLE `preset_search_fts` USING fts5(
	`preset_id` UNINDEXED,
	`title`,
	`author`,
	`description`,
	`secondary_text`,
	tokenize = 'unicode61 remove_diacritics 2'
);--> statement-breakpoint
CREATE TRIGGER `preset_search_documents_fts_insert`
AFTER INSERT ON `preset_search_documents`
BEGIN
	INSERT INTO `preset_search_fts` (`preset_id`, `title`, `author`, `description`, `secondary_text`)
	VALUES (NEW.`preset_id`, NEW.`title`, NEW.`author`, NEW.`description`, NEW.`secondary_text`);
END;--> statement-breakpoint
CREATE TRIGGER `preset_search_documents_fts_update`
AFTER UPDATE OF `title`, `author`, `description`, `secondary_text` ON `preset_search_documents`
BEGIN
	DELETE FROM `preset_search_fts` WHERE `preset_id` = OLD.`preset_id`;
	INSERT INTO `preset_search_fts` (`preset_id`, `title`, `author`, `description`, `secondary_text`)
	VALUES (NEW.`preset_id`, NEW.`title`, NEW.`author`, NEW.`description`, NEW.`secondary_text`);
END;--> statement-breakpoint
CREATE TRIGGER `preset_search_documents_fts_delete`
AFTER DELETE ON `preset_search_documents`
BEGIN
	DELETE FROM `preset_search_fts` WHERE `preset_id` = OLD.`preset_id`;
END;
