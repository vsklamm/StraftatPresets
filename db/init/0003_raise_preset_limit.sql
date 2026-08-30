ALTER TABLE `users` ADD `preset_limit` integer DEFAULT 4 NOT NULL;
--> statement-breakpoint
UPDATE `users`
SET `preset_limit` = 15,
    `updated_at` = unixepoch() * 1000
WHERE `preset_limit` < 15
  AND `id` IN (
    SELECT `author_id`
    FROM `presets`
    WHERE `status` = 'published'
      AND `thumbnail_key` IS NOT NULL
    GROUP BY `author_id`
    HAVING count(*) >= 3
  );
--> statement-breakpoint
CREATE TRIGGER `users_raise_preset_limit_after_publication`
AFTER UPDATE OF `status`, `thumbnail_key` ON `presets`
WHEN NEW.`status` = 'published'
  AND NEW.`thumbnail_key` IS NOT NULL
BEGIN
  UPDATE `users`
  SET `preset_limit` = 15,
      `updated_at` = unixepoch() * 1000
  WHERE `id` = NEW.`author_id`
    AND `preset_limit` < 15
    AND (
      SELECT count(*)
      FROM `presets`
      WHERE `author_id` = NEW.`author_id`
        AND `status` = 'published'
        AND `thumbnail_key` IS NOT NULL
    ) >= 3;
END;
