import rawCatalog from "@/game-data/tags.json";

export const TAG_CATEGORIES = ["lobby", "maps", "weapons", "experience"] as const;
type TagCategory = (typeof TAG_CATEGORIES)[number];

export type TagCatalogEntry = {
  slug: string;
  label: string;
  category: TagCategory;
};

type TagCatalog = {
  schemaVersion: number;
  tags: TagCatalogEntry[];
};

function assertTagCatalog(value: unknown): asserts value is TagCatalog {
  if (!value || typeof value !== "object") throw new Error("Tag catalog is not an object.");
  const catalog = value as Partial<TagCatalog>;
  if (catalog.schemaVersion !== 1) throw new Error("Unsupported tag catalog schema.");
  if (!Array.isArray(catalog.tags)) throw new Error("Tag catalog tags is not an array.");

  const slugs = new Set<string>();
  const labels = new Set<string>();
  for (const tag of catalog.tags) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag.slug)) throw new Error(`Invalid tag slug: ${tag.slug}`);
    if (tag.label.trim().length < 2 || tag.label.length > 32) throw new Error(`Invalid tag label: ${tag.label}`);
    if (!TAG_CATEGORIES.includes(tag.category)) throw new Error(`Invalid category for tag: ${tag.slug}`);
    if (slugs.has(tag.slug)) throw new Error(`Duplicate tag slug: ${tag.slug}`);
    const labelKey = tag.label.toLocaleLowerCase("en-US");
    if (labels.has(labelKey)) throw new Error(`Duplicate tag label: ${tag.label}`);
    slugs.add(tag.slug);
    labels.add(labelKey);
  }
}

assertTagCatalog(rawCatalog);

const tagCatalog: Readonly<TagCatalog> = rawCatalog;
export const tagCatalogEntries = Object.freeze(tagCatalog.tags);
