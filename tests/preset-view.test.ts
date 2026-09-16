import assert from "node:assert/strict";
import test from "node:test";
import {
  configLabels,
  presetIdentifierFromUrl,
  presetUrlIdentifier,
  presetUrlPath,
  urlWithoutPreset,
  RANDOMIZER_SETTINGS_LABEL_TMPRO,
  SWAPPER_SETTING_LABEL_TMPRO,
  SWAPPER_SETTINGS_LABEL_TMPRO,
  type Preset,
  type PresetVersion,
} from "../src/application/preset-view";
import { stripColorAndFormattingTags } from "../src/domain/straftat-markup";

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

test("configLabels generates TMPro colored labels for Randomizer and Swapper", () => {
  const versionWithAll: PresetVersion = {
    id: "v1",
    label: "v1.0",
    released: "2026-09-16",
    maps: [{ name: "Map 1", mapCount: 1, description: "", code: "test" }],
    randomizedWeapons: [{ name: "Pistol", weight: 1 }],
    swapper: [
      { name: "Swapper 1", description: "", code: "code1" },
      { name: "Swapper 2", description: "", code: "code2" },
    ],
  };

  const labels = configLabels(versionWithAll);
  assert.equal(labels.length, 3);
  assert.equal(labels[0], "1 Map Playlist");
  assert.equal(labels[1], RANDOMIZER_SETTINGS_LABEL_TMPRO);
  assert.equal(labels[2], `2 ${SWAPPER_SETTINGS_LABEL_TMPRO}`);

  // Stripped text matches human-readable expectations
  assert.equal(stripColorAndFormattingTags(labels[1]), "Randomizer Settings");
  assert.equal(stripColorAndFormattingTags(labels[2]), "2 Swapper Settings");

  // Singular forms when count is 1
  const versionWithSingle: PresetVersion = {
    id: "v2",
    label: "v1.1",
    released: "2026-09-16",
    maps: [
      { name: "Map 1", mapCount: 1, description: "", code: "code1" },
      { name: "Map 2", mapCount: 1, description: "", code: "code2" },
    ],
    swapper: [{ name: "Swapper 1", description: "", code: "code1" }],
  };

  const singleLabels = configLabels(versionWithSingle);
  assert.equal(singleLabels.length, 2);
  assert.equal(singleLabels[0], "2 Map Playlists");
  assert.equal(singleLabels[1], `1 ${SWAPPER_SETTING_LABEL_TMPRO}`);
  assert.equal(stripColorAndFormattingTags(singleLabels[1]), "1 Swapper Setting");

  // Empty when no features enabled
  const emptyLabels = configLabels({ label: "v1.2", released: "2026-09-16" });
  assert.deepEqual(emptyLabels, []);
});


