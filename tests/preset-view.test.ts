import assert from "node:assert/strict";
import test from "node:test";
import { presetUrlIdentifier, type Preset } from "../src/application/preset-view";

function preset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: "preset-id",
    slug: "preset-slug",
    title: "Preset",
    author: "Author",
    description: "Description",
    tags: [],
    copies: 0,
    versioningEnabled: false,
    versions: [],
    ...overrides,
  };
}

test("editable drafts use a stable ID while their title and slug can change", () => {
  assert.equal(presetUrlIdentifier(preset({ canEdit: true, state: "draft" })), "preset-id");
});

test("published presets keep their readable share slug", () => {
  assert.equal(presetUrlIdentifier(preset({ canEdit: true, state: "published" })), "preset-slug");
  assert.equal(presetUrlIdentifier(preset({ canEdit: false })), "preset-slug");
});
