import type { PublishedPresetPreview } from "@/src/application/ports";

type PublishedPresetPreviewRow = {
  id: string;
  slug: string;
  author_name: string;
  title: string;
  description: string;
  thumbnail_key: string | null;
};

export async function getPublishedPresetPreview(
  database: D1Database,
  identifier: string,
): Promise<PublishedPresetPreview | undefined> {
  const row = await database.prepare(`
    SELECT
      p.id,
      p.slug,
      coalesce(u.display_name, u.name) AS author_name,
      json_extract(r.content_json, '$.title') AS title,
      json_extract(r.content_json, '$.description') AS description,
      json_extract(r.content_json, '$.thumbnailKey') AS thumbnail_key
    FROM presets p
    INNER JOIN users u ON u.id = p.author_id
    INNER JOIN preset_revisions r ON r.id = p.published_revision_id
    WHERE p.status = 'published'
      AND p.published_revision_id IS NOT NULL
      AND (p.id = ?1 OR p.slug = ?1)
    LIMIT 1
  `).bind(identifier).first<PublishedPresetPreviewRow>();
  if (!row) return undefined;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    authorName: row.author_name,
    thumbnailKey: row.thumbnail_key,
  };
}
