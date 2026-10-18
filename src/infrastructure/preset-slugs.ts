import { eq, or, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { presets } from "@/db/schema";
import { presetSlugCandidates } from "@/src/domain/preset-content";

export function presetIdentifierCondition(identifier: string) {
  return or(eq(presets.id, identifier), eq(presets.slug, identifier),
    sql`${presets.id} = (SELECT preset_id FROM preset_slugs WHERE slug = ${identifier})`);
}

export async function availablePresetSlug(database: AppDatabase, title: string, id: string, short = true) {
  for (const candidate of presetSlugCandidates(title, id, short)) {
    const occupied = await database.all(sql`SELECT 1 WHERE
      EXISTS (SELECT 1 FROM preset_slugs WHERE slug = ${candidate} AND preset_id IS NOT ${id})
      OR EXISTS (SELECT 1 FROM presets WHERE id <> ${id} AND (slug = ${candidate} OR id = ${candidate}))`);
    if (!occupied.length) return candidate;
  }
  throw new Error("No available preset slug.");
}

export function isPresetSlugConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /preset slug unavailable|preset slug ownership is immutable|UNIQUE constraint failed: presets.slug/.test(error.message)
    || isPresetSlugConflict(error.cause);
}
