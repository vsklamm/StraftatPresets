export const MAX_PRESET_TAGS = 8;
export const MAX_VISIBLE_PRESET_TAGS = 5;

export function validatePresetTagSlugs(tagSlugs: readonly string[]) {
  const normalized = tagSlugs.map((slug) => slug.trim().toLowerCase());
  if (normalized.some((slug) => !slug)) throw new Error("Tag slugs cannot be empty.");
  if (new Set(normalized).size !== normalized.length) throw new Error("A preset cannot use the same tag twice.");
  if (normalized.length > MAX_PRESET_TAGS) throw new Error(`A preset can use at most ${MAX_PRESET_TAGS} tags.`);
  return normalized;
}
