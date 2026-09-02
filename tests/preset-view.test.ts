import assert from "node:assert/strict";
import test from "node:test";
import { presetIdentifierFromUrl, presetUrlIdentifier, presetUrlPath, urlWithoutPreset, type Preset } from "../src/application/preset-view";

function preset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: "preset-id",
    slug: "preset-slug",
    title: "Preset",
    author: "Author",
    description: "Description",
    tags: [],
    views: 0,
    copies: 0,
    versioningEnabled: false,
    versions: [],
    ...overrides,
  };
}

test("editable drafts use a stable ID while their title and slug can change", () => {
  const draft = preset({ canEdit: true, state: "draft", hasPublishedRevision: false });
  assert.equal(presetUrlIdentifier(draft), "preset-id");
  assert.equal(presetUrlPath(draft), "/?p=preset-id");
});

test("published presets keep their readable share slug", () => {
  const owned = preset({ canEdit: true, state: "published", hasPublishedRevision: true });
  const publicPreset = preset({ canEdit: false, hasPublishedRevision: true });
  assert.equal(presetUrlIdentifier(owned), "preset-slug");
  assert.equal(presetUrlPath(owned), "/p/preset-slug");
  assert.equal(presetUrlIdentifier(publicPreset), "preset-slug");
  assert.equal(presetUrlPath(publicPreset), "/p/preset-slug");
});

test("an unpublished pending preset keeps its private ID link", () => {
  const pending = preset({ canEdit: true, state: "pending", hasPublishedRevision: false });
  assert.equal(presetUrlPath(pending), "/?p=preset-id");
});

test("preset identifiers are read from new paths and legacy query links", () => {
  assert.equal(presetIdentifierFromUrl(new URL("https://example.com/p/game-of-mines")), "game-of-mines");
  assert.equal(presetIdentifierFromUrl(new URL("https://example.com/?p=legacy-id")), "legacy-id");
  assert.equal(urlWithoutPreset(new URL("https://example.com/p/game-of-mines")), "/");
  assert.equal(urlWithoutPreset(new URL("https://example.com/?p=legacy-id&q=mines")), "/?q=mines");
});
