ALTER TABLE `users` ADD `display_name_configured_at` integer;
--> statement-breakpoint
CREATE TRIGGER `users_display_name_insert_limit`
BEFORE INSERT ON `users`
WHEN NEW.`display_name` IS NOT NULL
  AND (length(NEW.`display_name`) = 0 OR length(NEW.`display_name`) > 400)
BEGIN
  SELECT RAISE(ABORT, 'invalid display name storage length');
END;
--> statement-breakpoint
CREATE TRIGGER `users_display_name_update_limit`
BEFORE UPDATE OF `display_name` ON `users`
WHEN NEW.`display_name` IS NOT NULL
  AND (length(NEW.`display_name`) = 0 OR length(NEW.`display_name`) > 400)
BEGIN
  SELECT RAISE(ABORT, 'invalid display name storage length');
END;
