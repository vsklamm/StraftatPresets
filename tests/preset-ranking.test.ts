import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEffectiveInteractions,
  calculateEngagementScore,
  calculateFreshnessScore,
  calculatePresetRanking,
  calculateQualityScore,
  PRESET_RANKING_LIMITS,
  scoreToMilli,
  validatePresetPublication,
  type PresetContentSignals,
  type PresetEngagementSignals,
} from "../src/domain/preset-ranking";

const minimumPreset: PresetContentSignals = {
  title: "Melee",
  description: "Melee only mode. Play this carefully, because it requires great precision.",
  hasThumbnail: false,
  versionCount: 1,
  mapPlaylistDescriptionLength: 0,
  mapPlaylistCount: 1,
  tagCount: 2,
  weaponConfigurationCount: 0,
  isSimple: false,
};

const noEngagement: PresetEngagementSignals = {
  opens: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
  linkOpens: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
  copies: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 },
};

test("publication requires 40 description characters, one version, one map playlist, and two tags", () => {
  assert.equal(validatePresetPublication(minimumPreset).publishable, true);
  const invalid = validatePresetPublication({
    ...minimumPreset,
    description: "short",
    mapPlaylistDescriptionLength: 0,
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
    mapPlaylistDescriptionLength: 40,
    tagCount: 8,
    weaponConfigurationCount: 2,
    isSimple: false,
  };
  const fullQuality = calculateQualityScore(fullPreset);
  const minQuality = calculateQualityScore(minimumPreset);
  assert.equal(fullQuality, 34.838);
  assert.ok(fullQuality <= PRESET_RANKING_LIMITS.quality);
  assert.ok(minQuality <= 15);
  assert.ok(fullQuality >= minQuality + 20);
});

test("description credit is front-loaded, bounded and ignores formatting", () => {
  for (const [length, expected] of [[39, 5], [40, 12.575], [48, 12.985], [80, 14.402], [100, 15.150], [160, 16.977], [250, 19], [500, 19]]) {
    const content = { ...minimumPreset, description: "x".repeat(length) };
    assert.equal(calculateQualityScore(content), expected);
    assert.equal(calculateQualityScore({ ...content, description: ` <b>${content.description}</b> ` }), expected);
  }
  assert.equal(validatePresetPublication({ ...minimumPreset, description: "x".repeat(39) }).publishable, false);
  assert.equal(validatePresetPublication({ ...minimumPreset, description: "x".repeat(40) }).publishable, true);
});

test("pool and explanation credit have independent fixed ceilings", () => {
  const baseline = { ...minimumPreset, description: "x".repeat(250) };
  const base = calculateQualityScore(baseline);
  for (let count = 1; count <= 10; count++) {
    assert.equal(calculateQualityScore({ ...baseline, mapPlaylistCount: count }), base + 0.4 * (Math.min(7, count) - 1));
  }
  for (const [length, bonus] of [[0, 0], [5, 0.25], [20, 1], [40, 2], [160, 2]]) {
    assert.equal(calculateQualityScore({ ...baseline, mapPlaylistDescriptionLength: length }), base + bonus);
  }
  assert.equal(calculateQualityScore({ ...baseline, mapPlaylistCount: 0, mapPlaylistDescriptionLength: 40 }), base - 7);
  assert.equal(calculateQualityScore({ ...baseline, hasThumbnail: true }), base + 6);
});

test("history rewards a second version with only small diminishing gains afterward", () => {
  const baseline = { ...minimumPreset, description: "x".repeat(250) };
  const base = calculateQualityScore(baseline);
  for (const [count, bonus] of [[1, 0], [2, 1.5], [3, 1.55], [4, 1.579], [5, 1.6], [10, 1.658], [100, 1.658]]) {
    assert.equal(calculateQualityScore({ ...baseline, versionCount: count }), base + bonus);
  }
});

test("invalid or fractional ranking counts are bounded without expanding publication limits", () => {
  for (const field of ["mapPlaylistCount", "mapPlaylistDescriptionLength", "versionCount", "tagCount", "weaponConfigurationCount"] as const) {
    for (const count of [-1, NaN, Infinity]) {
      assert.equal(calculateQualityScore({ ...minimumPreset, [field]: count }), calculateQualityScore({ ...minimumPreset, [field]: 0 }));
    }
    assert.equal(calculateQualityScore({ ...minimumPreset, [field]: 2.9 }), calculateQualityScore({ ...minimumPreset, [field]: 2 }));
  }
});

test("maximum rounded components fit the total score bound", () => {
  const full = { ...minimumPreset, description: "x".repeat(250), hasThumbnail: true, tagCount: 8, mapPlaylistCount: 7, mapPlaylistDescriptionLength: 40, weaponConfigurationCount: 7, versionCount: 10 };
  const metric = { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0, effective: 10000 };
  const now = Date.UTC(2026, 8, 22);
  const score = calculatePresetRanking(full, { copies: metric, opens: metric, linkOpens: metric }, now, now, { surge: 16, lucky: 24 });
  assert.deepEqual(score, { quality: 36.996, engagement: 44, freshness: 12, surge: 16, lucky: 24, total: 132.996 });
  assert.equal(scoreToMilli(score.total), 132996);
  assert.equal(scoreToMilli(200), 133000);
});

test("one browser cannot turn repeated clicks into fake unique engagement", () => {
  const repeated = calculateEffectiveInteractions({ total: 200, uniqueAnonymous: 1, uniqueAuthenticated: 0 });
  const fivePeople = calculateEffectiveInteractions({ total: 5, uniqueAnonymous: 5, uniqueAuthenticated: 0 });
  const authenticated = calculateEffectiveInteractions({ total: 1, uniqueAnonymous: 0, uniqueAuthenticated: 1 });
  assert.equal(repeated, 1);
  assert.equal(fivePeople, 5.0);
  assert.equal(authenticated, 2.5);
});

test("the new-preset boost starts at 12 with a three-day half-life", () => {
  const now = Date.UTC(2026, 7, 14);
  assert.equal(calculateFreshnessScore(now, now), 12);
  assert.equal(calculateFreshnessScore(now - 3 * 86_400_000, now), 6);
  assert.equal(calculateFreshnessScore(now - 6 * 86_400_000, now), 3);
  assert.equal(calculateFreshnessScore(now - 7 * 86_400_000, now), 2.381);
  assert.equal(calculateFreshnessScore(now - 14 * 86_400_000, now), 0.472);
  assert.equal(calculateFreshnessScore(now - 90 * 86_400_000, now), 0);
  assert.equal(calculateFreshnessScore("invalid", now), 0);
  assert.equal(calculateFreshnessScore(now, NaN), 0);
});

test("engagement is sensitive to low-volume community activity and saturates smoothly", () => {
  const copiesAt = (count: number): PresetEngagementSignals => ({
    ...noEngagement,
    copies: { total: count, uniqueAnonymous: count, uniqueAuthenticated: 0 },
  });
  const atOneCopy = calculatePresetRanking(minimumPreset, copiesAt(1), null).engagement;
  const atFiveCopies = calculatePresetRanking(minimumPreset, copiesAt(5), null).engagement;
  const atTwentyFiveCopies = calculatePresetRanking(minimumPreset, copiesAt(25), null).engagement;

  assert.ok(atOneCopy >= 5 && atOneCopy <= 8);
  assert.ok(atFiveCopies >= 14 && atFiveCopies <= 18);
  assert.equal(atTwentyFiveCopies, 28);
});

test("engagement preserves the old logarithm below its thresholds and extends smoothly above them", () => {
  for (const [key, threshold, anchor, maximum] of [["copies", 25, 28, 31], ["opens", 35, 9, 10]] as const) {
    const points = (effective: number) => calculateEngagementScore({ ...noEngagement, [key]: { ...noEngagement[key], effective } });
    for (const value of [0, 0.5, 1, 5, 10, threshold]) {
      assert.equal(points(value), Math.round(anchor * Math.log1p(value) / Math.log1p(threshold) * 1000) / 1000);
    }
    const scale = (maximum - anchor) * (1 + threshold) * Math.log1p(threshold) / anchor;
    for (const value of [threshold + 1, 40, 50, 100]) {
      const expected = anchor + (maximum - anchor) * (1 - Math.exp(-(value - threshold) / scale));
      assert.equal(points(value), Math.round(expected * 1000) / 1000);
    }
    const leftSlope = (points(threshold) - points(threshold - 0.1)) / 0.1;
    const rightSlope = (points(threshold + 0.1) - points(threshold)) / 0.1;
    assert.ok(Math.abs(leftSlope - rightSlope) < 0.011);
    let previousGain = Infinity;
    for (let value = 1; value <= 200; value++) {
      const gain = points(value) - points(value - 1);
      assert.ok(gain >= 0);
      assert.ok(gain <= previousGain + 0.0021);
      assert.ok(points(value) <= maximum);
      previousGain = gain;
    }
    assert.equal(points(10000), maximum);
    for (const value of [-1, NaN, Infinity]) assert.equal(points(value), 0);
  }
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
