import { z } from "zod";
import { presetSlugCandidates } from "./preset-content";

const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
export const presetSlugPlanSchema = z.array(z.object({
  id: identifier,
  oldSlug: identifier,
  newSlug: identifier,
  revisionId: identifier,
  title: z.string(),
}).strict()).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Duplicate preset IDs")
  .refine(rows => new Set(rows.map(row => row.newSlug)).size === rows.length, "Duplicate destination slugs");
export type PresetSlugChange = z.infer<typeof presetSlugPlanSchema>[number];
export type PresetSlugSource = { id: string; slug: string; status: string; revisionId: string | null; title: string };

export function planPresetSlugs(rows: readonly PresetSlugSource[], claims: readonly { slug: string; presetId: string | null }[]): PresetSlugChange[] {
  const reserved = new Map<string, string | null>();
  for (const row of rows) { reserved.set(row.slug, row.id); reserved.set(row.id, row.id); }
  for (const claim of claims) reserved.set(claim.slug, claim.presetId);
  return rows.filter(row => row.status === "published" && row.revisionId).map(row => {
    const newSlug = presetSlugCandidates(row.title, row.id).find(slug => !reserved.has(slug) || reserved.get(slug) === row.id);
    if (!newSlug) throw new Error(`No available slug for ${row.id}`);
    reserved.set(newSlug, row.id);
    return { id: row.id, oldSlug: row.slug, newSlug, revisionId: row.revisionId!, title: row.title };
  });
}
