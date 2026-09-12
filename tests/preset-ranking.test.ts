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
  mapPlaylistWithDescriptionCount: 0,
  mapPlaylistCount: 1,
  tagCount: 2,
  weaponConfigurationCount: 0,
};

const noEngagement: PresetEngagementSignals = {
  opens: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
  linkOpens: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
  copies: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
};

test("publication requires a useful description, one version, one map playlist, and two tags", () => {
  assert.equal(validatePresetPublication(minimumPreset).publishable, true);
  const invalid = validatePresetPublication({
    ...minimumPreset,
    description: "short",
    mapPlaylistWithDescriptionCount: 0,
    mapPlaylistCount: 0,
    tagCount: 1,
  });
  assert.equal(invalid.publishable, false);
  assert.deepEqual(invalid.validationErrors, [
    "Add a description of at least 40 characters",
    "Add a map playlist",
    "Choose at least 2 tags",
  ]);
});

test("quality is below 37 points and rewards polish over quantity", () => {
  const fullPreset: PresetContentSignals = {
    title: "Ultimate Melee Chaos",
    description: "A comprehensive melee preset designed for competitive duels across curated arena maps. Includes tuned weapon weights and customized playlists.".repeat(2),
    hasThumbnail: true,
    versionCount: 2,
    mapPlaylistCount: 2,
    mapPlaylistWithDescriptionCount: 2,
    tagCount: 8,
    weaponConfigurationCount: 2,
  };
  const fullQuality = calculateQualityScore(fullPreset);
  const minQuality = calculateQualityScore(minimumPreset);
  assert.equal(fullQuality, 36.938);
  assert.ok(fullQuality <= PRESET_RANKING_LIMITS.quality);
  assert.ok(minQuality <= 15);
  assert.ok(fullQuality >= minQuality + 20);
});

test("v1.2.1 adds completeness credit to descriptions, not quantity", () => {
  const baseline = { ...minimumPreset, description: "x".repeat(40) };
  const base = calculateQualityScore(baseline);
  assert.equal(calculateQualityScore({ ...baseline, description: "x".repeat(250) }) - base, 9);
  assert.equal(calculateQualityScore({ ...baseline, mapPlaylistWithDescriptionCount: 1 }) - base, 3);
  assert.equal(calculateQualityScore({ ...baseline, mapPlaylistCount: 7, mapPlaylistWithDescriptionCount: 7 }) - base, 3);
});

test("one browser cannot turn repeated clicks into fake unique engagement", () => {
  const repeated = calculateEffectiveInteractions({ total: 200, uniqueAnonymous: 1, uniqueAuthenticated: 0 });
  const fivePeople = calculateEffectiveInteractions({ total: 5, uniqueAnonymous: 5, uniqueAuthenticated: 0 });
  const authenticated = calculateEffectiveInteractions({ total: 1, uniqueAnonymous: 0, uniqueAuthenticated: 1 });
  assert.equal(repeated, 1);
  assert.equal(fivePeople, 5.0);
  assert.equal(authenticated, 2.5);
});

test("the new-preset boost has a five-day half-life", () => {
  const now = Date.UTC(2026, 7, 14);
  assert.equal(calculateFreshnessScore(now, now), 18);
  assert.equal(calculateFreshnessScore(now - 5 * 86_400_000, now), 9);
  assert.equal(calculateFreshnessScore(now - 10 * 86_400_000, now), 4.5);
  assert.equal(calculateFreshnessScore(now - 90 * 86_400_000, now), 0);
});

test("engagement is sensitive to low-volume community activity and saturates smoothly", () => {
  const copiesAt = (count: number): PresetEngagementSignals => ({
    ...noEngagement,
    copies: { total: count, uniqueAnonymous: count, uniqueAuthenticated: 0 },
  });
  const atOneCopy = calculatePresetRanking(minimumPreset, copiesAt(1), null).engagement;
  const atFiveCopies = calculatePresetRanking(minimumPreset, copiesAt(5), null).engagement;
  const atTwentyFiveCopies = calculatePresetRanking(minimumPreset, copiesAt(25), null).engagement;

  assert.ok(atOneCopy >= 5 && atOneCopy <= 8); // 1 copy provides immediate meaningful boost (~7 pts)
  assert.ok(atFiveCopies >= 14 && atFiveCopies <= 18);
  assert.equal(atTwentyFiveCopies, 28); // 28 pts max for copies
});

test("card views and direct link referrals contribute meaningfully to engagement", () => {
  const browsingSignals: PresetEngagementSignals = {
    opens: { total: 35, uniqueAnonymous: 35, uniqueAuthenticated: 0 },
    linkOpens: { total: 10, uniqueAnonymous: 10, uniqueAuthenticated: 0 },
    copies: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
  };
  const ranking = calculatePresetRanking(minimumPreset, browsingSignals, null);
  assert.equal(ranking.engagement, 12);
});
