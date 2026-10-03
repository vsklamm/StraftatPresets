import assert from "node:assert/strict";
import test from "node:test";
import {
  configLabels,
  presetStatusLabels,
  presetIsReadyToSubmit,
  presetIdentifierFromUrl,
  presetUrlIdentifier,
  presetUrlPath,
  urlWithoutPreset,
  type Preset,
  type PresetVersion,
} from "../src/application/preset-view";
import { stripColorAndFormattingTags } from "../src/domain/straftat-markup";
import type { PresetRevisionContent } from "../src/domain/preset-content";
import { validatePresetRevision } from "../src/domain/preset-workflow";

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

const submitReadyContent: PresetRevisionContent = {
  title: "Placement practice",
  description: "Carefully selected maps reward patient placement and close-range duels.",
  thumbnailKey: null,
  tags: ["placement", "explosives"],
  versioningEnabled: false,
  versions: [{
    label: "v1.0.0",
    mapPlaylists: [{ name: "Arena mix", description: "", encodedValue: "encoded", mapNames: ["Arena_00"] }],
    weaponConfigurations: [],
  }],
};

test("published presets distinguish the live preset from its draft update", () => {
  assert.deepEqual(presetStatusLabels(preset({ state: "draft", workingStatus: "draft", hasPublishedRevision: true })), [
    { state: "published", label: "Published" },
    { state: "draft", label: "Drafted" },
  ]);
});

test("status labels distinguish initial submissions, live presets and pending updates", () => {
  assert.deepEqual(presetStatusLabels(preset({ state: "draft", workingStatus: "draft", hasPublishedRevision: false })), [{ state: "draft", label: "Drafted" }]);
  assert.deepEqual(presetStatusLabels(preset({ state: "pending", workingStatus: "pending", hasPublishedRevision: false })), [{ state: "pending", label: "Pending" }]);
  assert.deepEqual(presetStatusLabels(preset({ state: "published", workingStatus: null, hasPublishedRevision: true })), [{ state: "published", label: "Published" }]);
  assert.deepEqual(presetStatusLabels(preset({ state: "pending", workingStatus: "pending", hasPublishedRevision: true })), [
    { state: "published", label: "Published" }, { state: "pending", label: "Pending" },
  ]);
  assert.deepEqual(presetStatusLabels(preset({ hasPublishedRevision: true })), []);
});

test("local edits keep the pending revision visible until they are saved", () => {
  const pending = preset({ state: "pending", workingStatus: "pending", hasPublishedRevision: true });
  assert.deepEqual(presetStatusLabels(pending, true), [
    { state: "published", label: "Published" }, { state: "pending", label: "Pending" }, { state: "draft", label: "New edits" },
  ]);
  assert.deepEqual(presetStatusLabels({ ...pending, state: "draft", workingStatus: "draft" }), [
    { state: "published", label: "Published" }, { state: "draft", label: "Drafted" },
  ]);
  assert.deepEqual(presetStatusLabels(preset({ state: "published", hasPublishedRevision: true }), true), [
    { state: "published", label: "Published" }, { state: "draft", label: "Drafted" },
  ]);
  assert.deepEqual(presetStatusLabels({ ...pending, hasPublishedRevision: false }, true), [
    { state: "pending", label: "Pending" }, { state: "draft", label: "New edits" },
  ]);
});

test("rejected revisions request changes without hiding the published preset", () => {
  const rejected = preset({ state: "draft", workingStatus: "rejected", hasPublishedRevision: true });
  assert.deepEqual(presetStatusLabels(rejected), [
    { state: "published", label: "Published" }, { state: "draft", label: "Needs changes" },
  ]);
  assert.deepEqual(presetStatusLabels(rejected, true), [
    { state: "published", label: "Published" }, { state: "draft", label: "Drafted" },
  ]);
  assert.deepEqual(presetStatusLabels({ ...rejected, hasPublishedRevision: false }), [{ state: "draft", label: "Needs changes" }]);
});

test("submission readiness accepts a complete draft without optional content", () => {
  assert.deepEqual(validatePresetRevision(submitReadyContent), []);
  assert.equal(presetIsReadyToSubmit(preset({ canEdit: true, state: "draft", workingStatus: "draft", issues: [], content: submitReadyContent })), true);
});

test("submission readiness stays quiet for published, pending, rejected and non-owned presets", () => {
  const draft = preset({ canEdit: true, state: "draft", workingStatus: "draft", issues: [], content: submitReadyContent });
  for (const overrides of [
    { state: "published", workingStatus: null },
    { state: "pending", workingStatus: "pending" },
    { workingStatus: "rejected" },
    { canEdit: false },
    { content: undefined },
    { issues: undefined },
    { issues: [{ source: "moderation", field: "thumbnail", code: "rejected", message: "Replace the thumbnail" }] },
  ] satisfies Partial<Preset>[]) {
    assert.equal(presetIsReadyToSubmit({ ...draft, ...overrides }), false);
  }
});

test("submission readiness checks required fields and every version without adding rules", () => {
  const version = submitReadyContent.versions[0];
  const invalidContents: PresetRevisionContent[] = [
    { ...submitReadyContent, title: "Untitled preset" },
    { ...submitReadyContent, description: "Too short" },
    { ...submitReadyContent, tags: ["placement"] },
    { ...submitReadyContent, versions: [] },
    { ...submitReadyContent, versions: [{ ...version, mapPlaylists: [] }] },
    { ...submitReadyContent, versions: [{ ...version, mapPlaylists: [{ ...version.mapPlaylists[0], encodedValue: "" }] }] },
    { ...submitReadyContent, versions: [{ ...version, mapPlaylists: [{ ...version.mapPlaylists[0], mapNames: [] }] }] },
    { ...submitReadyContent, versions: [{ ...version, weaponConfigurations: [{ kind: "randomized", name: "Randomizer", weapons: [] }] }] },
    { ...submitReadyContent, versions: [{ ...version, weaponConfigurations: [{ kind: "swapper", name: "Swapper", encodedValue: "" }] }] },
    { ...submitReadyContent, versions: [{ ...version, weaponConfigurations: [{ kind: "randomized", name: "Randomizer", weapons: [{ name: "Pistol", weight: 0 }] }] }] },
    { ...submitReadyContent, versioningEnabled: true, versions: [{ ...version, label: "v1.1.0" }, { ...version, mapPlaylists: [] }] },
  ];
  for (const content of invalidContents) {
    const issues = validatePresetRevision(content);
    assert.ok(issues.length > 0);
    assert.equal(presetIsReadyToSubmit(preset({ canEdit: true, state: "draft", workingStatus: "draft", issues, content })), false);
  }
});

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
  assert.equal(presetIdentifierFromUrl(new URL("https://example.com/p/example-arena-setup")), "example-arena-setup");
  assert.equal(presetIdentifierFromUrl(new URL("https://example.com/?p=legacy-id")), "legacy-id");
  assert.equal(urlWithoutPreset(new URL("https://example.com/p/example-arena-setup")), "/");
  assert.equal(urlWithoutPreset(new URL("https://example.com/?p=legacy-id&q=mines")), "/?q=mines");
});

test("configLabels generates TMPro colored labels for Randomizer and Swapper", () => {
  const versionWithRandomizer: PresetVersion = {
    id: "v1",
    label: "v1.0",
    released: "2026-09-16",
    maps: [{ name: "Map 1", mapCount: 1, description: "", code: "test" }],
    randomizedWeapons: [{ name: "Pistol", weight: 1 }],
  };

  const labels = configLabels(versionWithRandomizer);
  assert.equal(labels.length, 2);
  assert.equal(labels[0], "1 Map Playlist");
  assert.equal(stripColorAndFormattingTags(labels[1]), "Randomizer");

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
  assert.equal(stripColorAndFormattingTags(singleLabels[1]), "1 Swapper");

  const multipleSwapperLabels = configLabels({
    ...versionWithSingle,
    swapper: [
      { name: "Swapper 1", description: "", code: "code1" },
      { name: "Swapper 2", description: "", code: "code2" },
    ],
  });
  assert.equal(stripColorAndFormattingTags(multipleSwapperLabels[1]), "2 Swappers");

  // Empty when no features enabled
  const emptyLabels = configLabels({ label: "v1.2", released: "2026-09-16" });
  assert.deepEqual(emptyLabels, []);
});
