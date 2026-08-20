import assert from "node:assert/strict";
import { tagCatalogEntries, TAG_CATEGORIES } from "../src/domain/tag-catalog";

assert.ok(tagCatalogEntries.length > 20, `Expected more than 20 tags, found ${tagCatalogEntries.length}`);
for (const category of TAG_CATEGORIES) {
  assert.ok(tagCatalogEntries.some((tag) => tag.category === category), `No ${category} tags`);
}

console.log(`Tag catalog OK: ${tagCatalogEntries.length} public tags across all categories.`);
