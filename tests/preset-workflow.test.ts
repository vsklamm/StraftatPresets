import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPresetRevisionTransition,
  deriveUserPresetState,
  emptyPresetRevision,
  MAX_PRESET_SUBMISSIONS_PER_HOUR,
  ONE_HOUR_MS,
  planPresetEdit,
  PRESET_SUBMISSION_COOLDOWN_MS,
  validatePresetRevision,
  type PresetRevisionContent,
} from "../src/domain/preset-workflow";
import {
  DEFAULT_PRESET_LIMIT,
  ELEVATED_PRESET_LIMIT,
  PRESET_LIMIT_UPGRADE_THRESHOLD,
  PresetLimitReachedError,
} from "../src/domain/preset-policy";
import {
  createStarterPresetContent,
  formatCardDescriptionPreview,
  MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS,
  MAX_PRESET_DESCRIPTION_CHARACTERS,
  MAX_PRESET_VERSIONS,
  parsePresetRevisionContent,
} from "../src/domain/preset-content";

const completePreset: PresetRevisionContent = {
  title: "Game of Mines",
  description: "Mines, grenades and carefully selected maps.",
  thumbnailKey: "presets/game-of-mines/thumbnail.jpg",
  tags: ["mines", "placement"],
  versioningEnabled: false,
  versions: [{
    label: "v5.0.0",
    mapPlaylists: [{ name: "GoM Mix", description: "Slower maps with room for mine setups.", encodedValue: "encoded", mapNames: ["Arena_00"] }],
    weaponConfigurations: [{ kind: "randomized", name: "Game of Mines", weapons: [{ name: "AP Mine", weight: 100 }] }],
  }],
};

test("user-visible preset state stays limited to draft, pending, and published", () => {
  assert.equal(deriveUserPresetState("draft", false), "draft");
  assert.equal(deriveUserPresetState("rejected", true), "draft");
  assert.equal(deriveUserPresetState("pending", true), "pending");
  assert.equal(deriveUserPresetState(null, true), "published");
  assert.throws(() => deriveUserPresetState(null, false), /neither a working revision nor a published revision/);
});

test("edit plans preserve queued and published snapshots", () => {
  assert.equal(planPresetEdit(null, false), "create_initial");
  assert.equal(planPresetEdit("draft", false), "update_draft");
  assert.equal(planPresetEdit("pending", false), "fork_working");
  assert.equal(planPresetEdit("rejected", true), "fork_working");
  assert.equal(planPresetEdit(null, true), "fork_published");
});

test("revision state transitions are narrow and explicit", () => {
  assert.doesNotThrow(() => assertPresetRevisionTransition("draft", "pending"));
  assert.doesNotThrow(() => assertPresetRevisionTransition("pending", "rejected"));
  assert.doesNotThrow(() => assertPresetRevisionTransition("pending", "published"));
  assert.doesNotThrow(() => assertPresetRevisionTransition("pending", "superseded"));
  assert.doesNotThrow(() => assertPresetRevisionTransition("published", "archived"));
  assert.throws(() => assertPresetRevisionTransition("published", "draft"), /Invalid preset revision transition/);
  assert.throws(() => assertPresetRevisionTransition("pending", "draft"), /Invalid preset revision transition/);
});

test("draft validation returns structured fields that the dashboard can explain", () => {
  const issues = validatePresetRevision(emptyPresetRevision("X"));
  assert.deepEqual(issues.map((issue) => issue.field), ["title", "description", "tags", "versions"]);
  assert.equal(issues.every((issue) => issue.source === "validation"), true);
  assert.deepEqual(validatePresetRevision(completePreset), []);
});

test("preset versions use ordered semantic labels and cap the initial version", () => {
  assert.equal(MAX_PRESET_VERSIONS, 10);

  const invalidFormat = structuredClone(completePreset);
  invalidFormat.versions[0].label = "v5";
  assert.equal(validatePresetRevision(invalidFormat).some((issue) => issue.code === "invalid_version_label"), true);

  const highInitial = structuredClone(completePreset);
  highInitial.versions[0].label = "v10.0.1";
  assert.equal(validatePresetRevision(highInitial).some((issue) => issue.code === "initial_version_too_high"), true);
  assert.equal(validatePresetRevision(highInitial, { isInitialPublication: false }).some((issue) => issue.code === "initial_version_too_high"), false);

  const unordered = structuredClone(completePreset);
  unordered.versions.push({ label: "v6.0.0", mapPlaylists: [], weaponConfigurations: [] });
  assert.equal(validatePresetRevision(unordered).some((issue) => issue.code === "version_order"), true);

  const tooManyVersions = structuredClone(completePreset);
  tooManyVersions.versions = Array.from({ length: 11 }, (_, i) => ({
    label: `v${11 - i}.0.0`,
    mapPlaylists: [{ name: "List", description: "Desc", encodedValue: "e30=", mapNames: ["Arena_00"] }],
    weaponConfigurations: [],
  }));
  const tooManyIssues = validatePresetRevision(tooManyVersions);
  assert.equal(tooManyIssues.some((issue) => issue.code === "too_many_versions" && issue.field === "versions"), true);
  assert.throws(() => parsePresetRevisionContent(tooManyVersions));
});

test("new drafts persist an empty weapon configurations array for the picker", () => {
  const starter = createStarterPresetContent("Untitled preset");
  assert.equal(starter.versioningEnabled, false);
  assert.equal(starter.versions[0].label, "v1.0.0");
  assert.equal(starter.versions[0].mapPlaylists.length, 1);
  assert.equal(starter.versions[0].weaponConfigurations.length, 0);
});

test("stored presets infer versioning only when older content has multiple versions", () => {
  const oneVersion = structuredClone(completePreset) as Record<string, unknown>;
  delete oneVersion.versioningEnabled;
  assert.equal(parsePresetRevisionContent(oneVersion).versioningEnabled, false);

  const multipleVersions = structuredClone(completePreset) as Record<string, unknown>;
  delete multipleVersions.versioningEnabled;
  multipleVersions.versions = [
    ...completePreset.versions,
    { ...completePreset.versions[0], label: "v4.0.0" },
  ];
  assert.equal(parsePresetRevisionContent(multipleVersions).versioningEnabled, true);

  const explicitlyDisabled = { ...multipleVersions, versioningEnabled: false };
  const parsedDisabled = parsePresetRevisionContent(explicitlyDisabled);
  assert.equal(parsedDisabled.versioningEnabled, false);
  assert.equal(parsedDisabled.versions.length, 2);
});

test("map playlist descriptions are optional for submission", () => {
  const missingDescription = structuredClone(completePreset);
  missingDescription.versions[0].mapPlaylists[0].description = "";
  assert.equal(validatePresetRevision(missingDescription).some((issue) => issue.code === "missing_playlist_description"), false);
});

test("preset and playlist descriptions keep their UI-sized limits", () => {
  const longPreset = structuredClone(completePreset);
  longPreset.description = "x".repeat(MAX_PRESET_DESCRIPTION_CHARACTERS + 1);
  assert.throws(() => parsePresetRevisionContent(longPreset));

  const longPlaylist = structuredClone(completePreset);
  longPlaylist.versions[0].mapPlaylists[0].description = "x".repeat(MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS + 1);
  assert.throws(() => parsePresetRevisionContent(longPlaylist));

  // Max 10 lines allowed
  const tenLinesPreset = structuredClone(completePreset);
  tenLinesPreset.description = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join("\n");
  assert.equal(validatePresetRevision(tenLinesPreset).some((issue) => issue.code === "description_too_many_lines"), false);
  assert.doesNotThrow(() => parsePresetRevisionContent(tenLinesPreset));

  // 11 lines rejected on submission
  const elevenLinesPreset = structuredClone(completePreset);
  elevenLinesPreset.description = Array.from({ length: 11 }, (_, i) => `Line ${i + 1}`).join("\n");
  assert.equal(validatePresetRevision(elevenLinesPreset).some((issue) => issue.code === "description_too_many_lines"), true);

  // Handles different newline codes (\r\n, \r, \u2028, \u2029, \v, \f, \u0085)
  const mixedNewlinesPreset = structuredClone(completePreset);
  mixedNewlinesPreset.description = [
    "Line 1\r\nLine 2",
    "Line 3\rLine 4",
    "Line 5\u2028Line 6",
    "Line 7\u2029Line 8",
    "Line 9\u000BLine 10",
    "Line 11\u000CLine 12",
  ].join("\n");
  assert.equal(validatePresetRevision(mixedNewlinesPreset).some((issue) => issue.code === "description_too_many_lines"), true);

  // Single empty line between paragraphs is valid
  const singleEmptyLinePreset = structuredClone(completePreset);
  singleEmptyLinePreset.description = "Paragraph 1\n\nParagraph 2";
  assert.equal(validatePresetRevision(singleEmptyLinePreset).some((issue) => issue.code === "description_consecutive_empty_lines"), false);

  // Two consecutive empty lines are rejected on submission
  const twoEmptyLinesPreset = structuredClone(completePreset);
  twoEmptyLinesPreset.description = "Paragraph 1\n\n\nParagraph 2";
  assert.equal(validatePresetRevision(twoEmptyLinesPreset).some((issue) => issue.code === "description_consecutive_empty_lines"), true);

  // Two whitespace-only empty lines are rejected on submission
  const whitespaceEmptyLinesPreset = structuredClone(completePreset);
  whitespaceEmptyLinesPreset.description = "Paragraph 1\r\n   \r\n\t  \r\nParagraph 2";
  assert.equal(validatePresetRevision(whitespaceEmptyLinesPreset).some((issue) => issue.code === "description_consecutive_empty_lines"), true);

});

test("text quality checks catch keyboard mashing and excessive caps in titles and descriptions", () => {
  const badTitleMashing = structuredClone(completePreset);
  badTitleMashing.title = "aaaaaaah";
  assert.equal(validatePresetRevision(badTitleMashing).some((issue) => issue.code === "low_quality_title"), true, "badTitleMashing failed");

  const badTitleConsonants = structuredClone(completePreset);
  badTitleConsonants.title = "qwrtypsdfghjkl";
  assert.equal(validatePresetRevision(badTitleConsonants).some((issue) => issue.code === "low_quality_title"), true, "badTitleConsonants failed");

  const badDescMashing = structuredClone(completePreset);
  badDescMashing.description = "bbbbbbbbb";
  assert.equal(validatePresetRevision(badDescMashing).some((issue) => issue.code === "low_quality_description"), true, "badDescMashing failed");

  const badDescCaps = structuredClone(completePreset);
  badDescCaps.description = "LOUD NOISES HERE";
  assert.equal(validatePresetRevision(badDescCaps).some((issue) => issue.code === "uppercase_description"), true, "badDescCaps failed");

  const badPlaylistDesc = structuredClone(completePreset);
  badPlaylistDesc.versions[0].mapPlaylists[0].description = "qwrtypsdfghjkl";
  assert.equal(validatePresetRevision(badPlaylistDesc).some((issue) => issue.code === "low_quality_playlist_description"), true, "badPlaylistDesc failed");

  const badPlaylistDescCaps = structuredClone(completePreset);
  badPlaylistDescCaps.versions[0].mapPlaylists[0].description = "ONLY PLAY THIS ON SATURDAY";
  assert.equal(validatePresetRevision(badPlaylistDescCaps).some((issue) => issue.code === "uppercase_playlist_description"), true, "badPlaylistDescCaps failed");
});

test("names enforce 70 visible symbols limit while allowing up to 500 total chars for color codes", () => {
  // 1. Title with color codes: 70 visible chars + color tags (< 500 raw chars) -> valid
  const validColoredTitle = structuredClone(completePreset);
  validColoredTitle.title = "<#FF0000>Tactical Snipers Rotation Game " + "<#00FF00>Arena Mix 1 Play</color>";
  assert.equal(validatePresetRevision(validColoredTitle).some((i) => i.code.includes("title")), false);

  // 2. Title with 71 visible symbols -> invalid
  const tooLongTitleSymbols = structuredClone(completePreset);
  tooLongTitleSymbols.title = "A".repeat(71);
  assert.equal(validatePresetRevision(tooLongTitleSymbols).some((i) => i.code === "title_too_long"), true);

  // 3. Title with > 500 raw characters -> invalid
  const tooLongTitleRaw = structuredClone(completePreset);
  tooLongTitleRaw.title = "<#123456>" + "A".repeat(50) + "</color>".repeat(60); // > 500 raw chars
  assert.equal(validatePresetRevision(tooLongTitleRaw).some((i) => i.code === "title_raw_too_long"), true);

  // 4. Map playlist name with 71 visible symbols -> invalid
  const tooLongPlaylistName = structuredClone(completePreset);
  tooLongPlaylistName.versions[0].mapPlaylists[0].name = "B".repeat(71);
  assert.equal(validatePresetRevision(tooLongPlaylistName).some((i) => i.code === "playlist_name_too_long"), true);

  // 5. Swapper name with 71 visible symbols -> invalid
  const tooLongSwapperName = structuredClone(completePreset);
  tooLongSwapperName.versions[0].weaponConfigurations = [{
    kind: "swapper",
    name: "C".repeat(71),
    encodedValue: "U1dBUFBFUg==",
  }];
  assert.equal(validatePresetRevision(tooLongSwapperName).some((i) => i.code === "swapper_name_too_long"), true);
});

test("formatCardDescriptionPreview displays first paragraph when >= 40 chars or joins second paragraph when < 40 chars", () => {
  // Empty or whitespace
  assert.equal(formatCardDescriptionPreview(""), "");
  assert.equal(formatCardDescriptionPreview("   \n\n\r\n   "), "");

  // Single paragraph >= 40 chars
  const longFirst = "This is a comprehensive description that has more than forty characters in total.";
  assert.equal(formatCardDescriptionPreview(longFirst), longFirst);

  // Multiple paragraphs, first >= 40 chars -> only first paragraph
  const multiLongFirst = `${longFirst}\n\nSecond paragraph details here.\nThird paragraph.`;
  assert.equal(formatCardDescriptionPreview(multiLongFirst), longFirst);

  // Exactly 40 chars on first paragraph -> only first paragraph
  const exact40 = "1234567890123456789012345678901234567890";
  assert.equal(exact40.length, 40);
  assert.equal(formatCardDescriptionPreview(`${exact40}\nSecond paragraph`), exact40);

  // 39 chars on first paragraph -> joins second paragraph
  const exact39 = "123456789012345678901234567890123456789";
  assert.equal(exact39.length, 39);
  assert.equal(formatCardDescriptionPreview(`${exact39}\nSecond paragraph`), `${exact39} Second paragraph`);

  // Multiple paragraphs with blank lines in between, first < 40 chars
  const shortFirstWithGaps = "\n\n  Quick intro.  \n\n\n  Detailed setup for 1v1 arena duels.  \n\n  Extra note.";
  assert.equal(formatCardDescriptionPreview(shortFirstWithGaps), "Quick intro. Detailed setup for 1v1 arena duels.");

  // Single paragraph < 40 chars -> returns single paragraph
  assert.equal(formatCardDescriptionPreview("Short single line."), "Short single line.");
});

test("author preset policy permanently raises the limit after three published presets with thumbnails", () => {
  assert.equal(DEFAULT_PRESET_LIMIT, 4);
  assert.equal(ELEVATED_PRESET_LIMIT, 15);
  assert.equal(PRESET_LIMIT_UPGRADE_THRESHOLD, 3);
  const error = new PresetLimitReachedError();
  assert.equal(error.limit, 4);
  assert.equal(error.code, "preset_limit_reached");
  assert.ok(error.message.includes("limit of 4 presets"));
  assert.ok(error.message.includes("Update an existing preset"));
});

test("validatePresetRevision enforces sanity checks on each version in multi-version presets", () => {
  // Preset where version 0 (v1.1.0) has 0 map playlists, and version 1 (v1.0.0) is complete
  const multiVersionMissingPlaylist: PresetRevisionContent = {
    title: "Multi Version Test",
    description: "Valid description for testing multi-version sanity checks and rules.",
    thumbnailKey: null,
    tags: ["lobby", "maps"],
    versioningEnabled: true,
    versions: [
      {
        label: "v1.1.0",
        mapPlaylists: [], // Missing playlist in new version!
        weaponConfigurations: [],
      },
      {
        label: "v1.0.0",
        mapPlaylists: [{
          name: "Original Playlist",
          description: "Valid playlist",
          encodedValue: "code",
          mapNames: ["Arena_00"],
        }],
        weaponConfigurations: [],
      },
    ],
  };

  const issues = validatePresetRevision(multiVersionMissingPlaylist, { isInitialPublication: false });
  const missingPlaylistIssue = issues.find((i) => i.code === "missing_map_playlist");
  assert.ok(missingPlaylistIssue, "Must report missing map playlist for the empty version");
  assert.equal(missingPlaylistIssue?.field, "versions.0.mapPlaylists");
});

test("validatePresetRevision enforces map playlists [1, 7], swappers [1, 7], and randomized weapons [1, max] per version", () => {
  const baseValid = structuredClone(completePreset);

  // 1. Map playlists max 7:
  const eightPlaylists = structuredClone(baseValid);
  eightPlaylists.versions[0].mapPlaylists = Array.from({ length: 8 }, (_, i) => ({
    name: `Playlist ${i + 1}`,
    description: `Desc ${i + 1}`,
    encodedValue: "code",
    mapNames: ["Arena_00"],
  }));
  assert.equal(validatePresetRevision(eightPlaylists).some((i) => i.code === "too_many_map_playlists"), true);

  const sevenPlaylists = structuredClone(baseValid);
  sevenPlaylists.versions[0].mapPlaylists = Array.from({ length: 7 }, (_, i) => ({
    name: `Playlist ${i + 1}`,
    description: `Desc ${i + 1}`,
    encodedValue: "code",
    mapNames: ["Arena_00"],
  }));
  assert.equal(validatePresetRevision(sevenPlaylists).some((i) => i.code === "too_many_map_playlists"), false);

  // 2. Swapper settings [1, 7]:
  const eightSwappers = structuredClone(baseValid);
  eightSwappers.versions[0].weaponConfigurations = Array.from({ length: 8 }, (_, i) => ({
    kind: "swapper" as const,
    name: `Swapper ${i + 1}`,
    encodedValue: "swappercode",
  }));
  assert.equal(validatePresetRevision(eightSwappers).some((i) => i.code === "too_many_swapper_configurations"), true);

  const sevenSwappers = structuredClone(baseValid);
  sevenSwappers.versions[0].weaponConfigurations = Array.from({ length: 7 }, (_, i) => ({
    kind: "swapper" as const,
    name: `Swapper ${i + 1}`,
    encodedValue: "swappercode",
  }));
  assert.equal(validatePresetRevision(sevenSwappers).some((i) => i.code === "too_many_swapper_configurations"), false);

  // 3. Randomized weapons [1, max weapons]:
  const emptyRandomized = structuredClone(baseValid);
  emptyRandomized.versions[0].weaponConfigurations = [{
    kind: "randomized" as const,
    name: "Randomized Pool",
    weapons: [],
  }];
  assert.equal(validatePresetRevision(emptyRandomized).some((i) => i.code === "empty_randomized_pool"), true);

  const singleWeaponRandomized = structuredClone(baseValid);
  singleWeaponRandomized.versions[0].weaponConfigurations = [{
    kind: "randomized" as const,
    name: "Randomized Pool",
    weapons: [{ name: "Claymore", weight: 50 }],
  }];
  assert.equal(validatePresetRevision(singleWeaponRandomized).some((i) => i.code === "empty_randomized_pool"), false);

  // 4. Mixing swappers and randomized weapons:
  const mixedVersion = structuredClone(baseValid);
  mixedVersion.versions[0].weaponConfigurations = [
    { kind: "randomized" as const, name: "Pool", weapons: [{ name: "Claymore", weight: 50 }] },
    { kind: "swapper" as const, name: "Swapper", encodedValue: "code" },
  ];
  assert.equal(validatePresetRevision(mixedVersion).some((i) => i.code === "mixed_weapon_configurations"), true);
});

test("preset submission policy defines 20-second cooldown and 10 submissions per hour cap", () => {
  assert.equal(PRESET_SUBMISSION_COOLDOWN_MS, 20_000);
  assert.equal(MAX_PRESET_SUBMISSIONS_PER_HOUR, 10);
  assert.equal(ONE_HOUR_MS, 3_600_000);
});
