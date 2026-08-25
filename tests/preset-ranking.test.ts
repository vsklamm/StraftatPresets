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

test("quality is capped at 40 points and rewards complete polish over bare minimum", () => {
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
  assert.equal(fullQuality, PRESET_RANKING_LIMITS.quality); // 40
  assert.ok(minQuality <= 15);
  assert.ok(fullQuality >= minQuality + 25);
});

test("one browser cannot turn repeated clicks into fake unique engagement", () => {
  const repeated = calculateEffectiveInteractions({ total: 200, uniqueAnonymous: 1, uniqueAuthenticated: 0 });
  const fivePeople = calculateEffectiveInteractions({ total: 5, uniqueAnonymous: 5, uniqueAuthenticated: 0 });
  const authenticated = calculateEffectiveInteractions({ total: 1, uniqueAnonymous: 0, uniqueAuthenticated: 1 });
  assert.equal(repeated, 1.5); // 1.0 anonymous + 0.5 max repeat credit
  assert.equal(fivePeople, 5.0);
  assert.equal(authenticated, 2.0); // 2.0x weight for authenticated Discord user
});

test("the new-preset boost decays linearly from 5 to 0 over 14 days", () => {
  const now = Date.UTC(2026, 7, 14);
  assert.equal(calculateFreshnessScore(now, now), 5);
  assert.equal(calculateFreshnessScore(now - 7 * 86_400_000, now), 2.5);
  assert.equal(calculateFreshnessScore(now - 14 * 86_400_000, now), 0);
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
  assert.equal(ranking.engagement, 27); // 20 pts from views + 7 pts from link opens
});
