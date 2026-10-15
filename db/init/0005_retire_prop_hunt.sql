UPDATE tags
SET is_active = 0, updated_at = (unixepoch() * 1000)
WHERE slug = 'prop-hunt' AND is_active <> 0;
