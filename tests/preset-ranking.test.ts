import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEffectiveInteractions,
  calculateFreshnessScore,
  calculatePresetRanking,
  calculateQualityScore,
  PRESET_RANKING_LIMITS,
  validatePresetPublication,
  type PresetContentSignals,
  type PresetEngagementSignals,
} from "../src/domain/preset-ranking";

const minimumPreset: PresetContentSignals = {
  title: "Melee",
  description: "Melee only mode. Play this carefully, because it requires great precision.",
  hasThumbnail: false,
  versionCount: 1,
  mapPlaylistWithDescriptionCount: 1,
    mapPlaylistCount: 1,
  tagCount: 2,
  weaponConfigurationCount: 0,
};

const noEngagement: PresetEngagementSignals = {
  likes: 0,
  opens: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
  linkOpens: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
  copies: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
};

test("publication requires a useful description, one version, one map playlist, and two tags", () => {
  assert.equal(validatePresetPublication(minimumPreset).publishable, true);
  const invalid = validatePresetPublication({ ...minimumPreset, description: "short", mapPlaylistWithDescriptionCount: 0,
    mapPlaylistCount: 0, tagCount: 1 });
  assert.equal(invalid.publishable, false);
  assert.deepEqual(invalid.validationErrors, ["Add a description of at least 40 characters", "Add a map playlist", "Choose at least 2 tags"]);
});

test("quality is capped at seventy points and favors complete presets", () => {
  const fullPreset = { ...minimumPreset, description: "x".repeat(300), hasThumbnail: true, versionCount: 9, mapPlaylistWithDescriptionCount: 9,
    mapPlaylistCount: 9, tagCount: 8, weaponConfigurationCount: 3 };
  assert.equal(calculateQualityScore(fullPreset), PRESET_RANKING_LIMITS.quality);
  assert.ok(calculateQualityScore(fullPreset) > calculateQualityScore(minimumPreset) + 35);
});

test("one browser cannot turn repeated events into fake unique engagement", () => {
  const repeated = calculateEffectiveInteractions({ total: 200, uniqueAnonymous: 1, uniqueAuthenticated: 0 });
  const fivePeople = calculateEffectiveInteractions({ total: 5, uniqueAnonymous: 5, uniqueAuthenticated: 0 });
  const authenticated = calculateEffectiveInteractions({ total: 1, uniqueAnonymous: 0, uniqueAuthenticated: 1 });
  assert.equal(repeated, 1.5);
  assert.equal(fivePeople, 5);
  assert.equal(authenticated, 1.5);
});

test("the new-preset boost decays linearly and disappears after fourteen days", () => {
  const now = Date.UTC(2026, 7, 14);
  assert.equal(calculateFreshnessScore(now, now), 4);
  assert.equal(calculateFreshnessScore(now - 7 * 86_400_000, now), 2);
  assert.equal(calculateFreshnessScore(now - 14 * 86_400_000, now), 0);
  assert.equal(calculateFreshnessScore(now - 90 * 86_400_000, now), 0);
});

test("maximum engagement cannot outrank a complete preset on its own", () => {
  const fullPreset = { ...minimumPreset, description: "x".repeat(300), hasThumbnail: true, versionCount: 5, mapPlaylistWithDescriptionCount: 5,
    mapPlaylistCount: 5, tagCount: 8, weaponConfigurationCount: 1 };
  const saturated: PresetEngagementSignals = {
    likes: 100,
    opens: { total: 100, uniqueAnonymous: 50, uniqueAuthenticated: 20 },
    linkOpens: { total: 100, uniqueAnonymous: 50, uniqueAuthenticated: 20 },
    copies: { total: 100, uniqueAnonymous: 50, uniqueAuthenticated: 20 },
  };
  const now = Date.UTC(2026, 7, 14);
  const complete = calculatePresetRanking(fullPreset, noEngagement, now - 30 * 86_400_000, now);
  const thinButPopular = calculatePresetRanking(minimumPreset, saturated, now - 30 * 86_400_000, now);
  assert.equal(thinButPopular.engagement, PRESET_RANKING_LIMITS.engagement);
  assert.ok(complete.total > thinButPopular.total);
});
