CREATE TABLE `preset_slugs` (
	`slug` text PRIMARY KEY NOT NULL,
	`preset_id` text,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_preset_slugs_preset_id` ON `preset_slugs` (`preset_id`);
--> statement-breakpoint
INSERT INTO preset_slugs (slug, preset_id) SELECT slug, id FROM presets;
--> statement-breakpoint
CREATE TRIGGER preset_slugs_guard_identifier BEFORE INSERT ON preset_slugs
WHEN EXISTS (SELECT 1 FROM presets WHERE id IS NOT NEW.preset_id AND (slug = NEW.slug OR id = NEW.slug))
BEGIN
  SELECT RAISE(ABORT, 'preset slug unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER preset_slugs_keep_owner BEFORE UPDATE OF slug, preset_id ON preset_slugs
WHEN NEW.slug IS NOT OLD.slug OR (
  NEW.preset_id IS NOT OLD.preset_id AND (
    NEW.preset_id IS NOT NULL OR EXISTS (SELECT 1 FROM presets WHERE id = OLD.preset_id)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'preset slug ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER preset_slugs_keep_reservation BEFORE DELETE ON preset_slugs
BEGIN
  SELECT RAISE(ABORT, 'preset slug reservations cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER presets_guard_slug_insert BEFORE INSERT ON presets
WHEN EXISTS (SELECT 1 FROM preset_slugs WHERE slug = NEW.slug AND preset_id IS NOT NEW.id)
  OR EXISTS (SELECT 1 FROM presets WHERE id = NEW.slug AND id <> NEW.id)
  OR EXISTS (SELECT 1 FROM preset_slugs WHERE slug = NEW.id AND preset_id IS NOT NEW.id)
  OR EXISTS (SELECT 1 FROM presets WHERE slug = NEW.id AND id <> NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'preset slug unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER presets_guard_slug_update BEFORE UPDATE OF slug ON presets
WHEN EXISTS (SELECT 1 FROM preset_slugs WHERE slug = NEW.slug AND preset_id IS NOT NEW.id)
  OR EXISTS (SELECT 1 FROM presets WHERE id = NEW.slug AND id <> NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'preset slug unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER presets_reserve_public_slugs AFTER UPDATE OF slug, status, published_revision_id ON presets
WHEN NEW.status = 'published' AND NEW.published_revision_id IS NOT NULL
BEGIN
  INSERT INTO preset_slugs (slug, preset_id) VALUES (OLD.slug, NEW.id)
    ON CONFLICT(slug) DO UPDATE SET preset_id = excluded.preset_id;
  INSERT INTO preset_slugs (slug, preset_id) VALUES (NEW.slug, NEW.id)
    ON CONFLICT(slug) DO UPDATE SET preset_id = excluded.preset_id;
END;
--> statement-breakpoint
CREATE TRIGGER presets_reserve_deleted_slug BEFORE DELETE ON presets
BEGIN
  INSERT INTO preset_slugs (slug, preset_id) VALUES (OLD.slug, OLD.id)
    ON CONFLICT(slug) DO UPDATE SET preset_id = excluded.preset_id;
END;
