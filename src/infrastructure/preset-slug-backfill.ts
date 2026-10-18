import { sql } from "drizzle-orm";
import { presetSlugPlanSchema, type PresetSlugChange } from "@/src/domain/preset-slug-plan";

export function presetSlugBackfillSql(input: readonly PresetSlugChange[]) {
  const plan = presetSlugPlanSchema.parse(input);
  if (!plan.length) throw new Error("The slug plan is empty.");
  return sql`WITH mapping(id, old_slug, new_slug, revision_id, title) AS (VALUES
    ${sql.join(plan.map(p => sql`(${p.id}, ${p.oldSlug}, ${p.newSlug}, ${p.revisionId}, ${p.title})`), sql`, `)}
  ), valid AS MATERIALIZED (
    SELECT count(*) AS total FROM mapping m
    INNER JOIN presets p ON p.id = m.id
    INNER JOIN preset_revisions r ON r.id = p.published_revision_id AND r.preset_id = p.id
    WHERE p.status = 'published' AND r.status = 'published' AND r.id = m.revision_id
      AND json_extract(r.content_json, '$.title') = m.title AND p.slug IN (m.old_slug, m.new_slug)
  )
  UPDATE presets SET slug = CASE WHEN (SELECT total FROM valid) = ${plan.length}
    THEN (SELECT new_slug FROM mapping WHERE id = presets.id) ELSE NULL END
  WHERE id IN (SELECT id FROM mapping) RETURNING id, slug`;
}
