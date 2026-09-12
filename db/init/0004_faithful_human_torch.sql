CREATE TABLE `preset_ranking_cache` (
	`id` integer PRIMARY KEY NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`formula_version` integer DEFAULT 0 NOT NULL,
	`generated_at` integer DEFAULT 0 NOT NULL,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`payload` text,
	CONSTRAINT "preset_ranking_cache_singleton" CHECK("preset_ranking_cache"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `preset_ranking_lottery` (
	`day` text PRIMARY KEY NOT NULL,
	`first_preset_id` text,
	`second_preset_id` text
);
--> statement-breakpoint
ALTER TABLE `presets` ADD `first_published_at` integer;
--> statement-breakpoint
-- Use actual approval evidence, never a rejected review timestamp. Retractions
-- retain the original Telegram approval timestamp even when reviewed_at changes.
UPDATE presets SET first_published_at = (
  SELECT min(value) FROM (
    SELECT published_at AS value
    UNION ALL SELECT reviewed_at FROM preset_revisions
      WHERE preset_id = presets.id AND status IN ('published', 'archived')
    UNION ALL SELECT telegram_resolved_at FROM preset_revisions
      WHERE preset_id = presets.id AND telegram_decision = 'approve'
    UNION ALL SELECT min(created_at) FROM preset_events WHERE preset_id = presets.id
  ) WHERE value IS NOT NULL
);
--> statement-breakpoint
-- Legacy published rows without retained approval evidence do not get a new launch.
UPDATE presets SET first_published_at = created_at
WHERE first_published_at IS NULL AND (status = 'published' OR retracted_at IS NOT NULL);
--> statement-breakpoint
INSERT INTO preset_ranking_cache (id) VALUES (1);
--> statement-breakpoint
CREATE TRIGGER presets_first_publication_insert AFTER INSERT ON presets
WHEN NEW.status = 'published' AND NEW.first_published_at IS NULL
BEGIN
  UPDATE presets SET first_published_at = coalesce(NEW.published_at, unixepoch() * 1000) WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER presets_first_publication_update AFTER UPDATE OF status, published_revision_id ON presets
WHEN NEW.status = 'published' AND NEW.first_published_at IS NULL
BEGIN
  UPDATE presets SET first_published_at = coalesce(NEW.published_at, unixepoch() * 1000) WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER presets_first_publication_immutable BEFORE UPDATE OF first_published_at ON presets
WHEN OLD.first_published_at IS NOT NULL AND NEW.first_published_at IS NOT OLD.first_published_at
BEGIN
  SELECT RAISE(ABORT, 'first publication timestamp is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER presets_invalidate_ranking_update AFTER UPDATE OF status, published_revision_id, first_published_at, slug, author_id ON presets
WHEN NEW.status IS NOT OLD.status OR NEW.published_revision_id IS NOT OLD.published_revision_id
  OR NEW.first_published_at IS NOT OLD.first_published_at OR NEW.slug IS NOT OLD.slug OR NEW.author_id IS NOT OLD.author_id
BEGIN
  UPDATE preset_ranking_cache SET generation = generation + 1, payload = NULL WHERE id = 1;
END;
--> statement-breakpoint
CREATE TRIGGER presets_invalidate_ranking_insert AFTER INSERT ON presets WHEN NEW.status = 'published'
BEGIN
  UPDATE preset_ranking_cache SET generation = generation + 1, payload = NULL WHERE id = 1;
END;
--> statement-breakpoint
CREATE TRIGGER presets_invalidate_ranking_delete AFTER DELETE ON presets
BEGIN
  UPDATE preset_ranking_cache SET generation = generation + 1, payload = NULL WHERE id = 1;
END;
--> statement-breakpoint
CREATE TRIGGER events_invalidate_ranking_update AFTER UPDATE ON preset_events
BEGIN
  UPDATE preset_ranking_cache SET generation = generation + 1, payload = NULL WHERE id = 1;
END;
--> statement-breakpoint
CREATE TRIGGER events_invalidate_ranking_delete AFTER DELETE ON preset_events
BEGIN
  UPDATE preset_ranking_cache SET generation = generation + 1, payload = NULL WHERE id = 1;
END;
