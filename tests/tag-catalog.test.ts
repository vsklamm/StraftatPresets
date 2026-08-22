import assert from "node:assert/strict";
import test from "node:test";
import { tagCatalogEntries, TAG_CATEGORIES } from "../src/domain/tag-catalog";
import { MAX_PRESET_TAGS, MAX_VISIBLE_PRESET_TAGS, validatePresetTagSlugs } from "../src/domain/tag-policy";

test("tag catalog meets sanity and integrity contracts", () => {
  assert.deepEqual(TAG_CATEGORIES, ["lobby", "maps", "weapons", "gameplay"]);

  // Count sanity: supported tags amount is > 20
  assert.ok(tagCatalogEntries.length > 20, `Expected > 20 tags, found ${tagCatalogEntries.length}`);

  // All defined categories are represented
  for (const category of TAG_CATEGORIES) {
    assert.ok(tagCatalogEntries.some((tag) => tag.category === category), `Missing tags for category: ${category}`);
  }

  const slugs = new Set<string>();
  const labels = new Set<string>();

  for (const tag of tagCatalogEntries) {
    // Slug format contract: lower-kebab-case
    assert.match(tag.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `Invalid tag slug: ${tag.slug}`);
    assert.equal(slugs.has(tag.slug), false, `Duplicate tag slug: ${tag.slug}`);
    slugs.add(tag.slug);

    // Label contract: trimmed, non-empty, reasonable length
    assert.ok(tag.label.trim().length >= 2, `Tag label too short: ${tag.label}`);
    assert.ok(tag.label.length <= 32, `Tag label too long: ${tag.label}`);
    const labelKey = tag.label.toLocaleLowerCase("en-US");
    assert.equal(labels.has(labelKey), false, `Duplicate tag label: ${tag.label}`);
    labels.add(labelKey);

    // Category contract
    assert.ok(TAG_CATEGORIES.includes(tag.category), `Invalid category for tag ${tag.slug}: ${tag.category}`);
  }
});

test("tag policy contracts enforce stored and visible limits", () => {
  assert.equal(MAX_PRESET_TAGS, 8);
  assert.equal(MAX_VISIBLE_PRESET_TAGS, 5);

  // Normalizes whitespace and casing
  assert.deepEqual(validatePresetTagSlugs(["Aim", " Movement "]), ["aim", "movement"]);

  // Rejects duplicates
  assert.throws(() => validatePresetTagSlugs(["aim", "AIM"]), /same tag twice/);

  // Rejects empty slugs
  assert.throws(() => validatePresetTagSlugs(["aim", ""]), /cannot be empty/);

  // Rejects exceeding max limit (8)
  assert.throws(() => validatePresetTagSlugs(Array.from({ length: 9 }, (_, index) => `tag-${index}`)), /at most 8/);
});
