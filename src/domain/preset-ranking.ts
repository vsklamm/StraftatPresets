import {
  MAX_MAP_PLAYLISTS,
  MAX_PLAYLIST_NAME_CHARACTERS,
  MAX_PLAYLIST_NAME_SYMBOLS,
  MAX_PRESET_DESCRIPTION_CHARACTERS,
  MAX_PRESET_TITLE_CHARACTERS,
  MAX_PRESET_TITLE_SYMBOLS,
  MAX_PRESET_VERSIONS,
  MAX_RANDOMIZED_WEAPONS,
  MAX_SWAPPER_CONFIGURATIONS,
  MAX_SWAPPER_NAME_CHARACTERS,
  MAX_SWAPPER_NAME_SYMBOLS,
  MIN_MAP_PLAYLISTS,
  MIN_RANDOMIZED_WEAPONS,
} from "./preset-content";
import { MAX_PRESET_TAGS } from "./tag-policy";

export const PRESET_RANKING_LIMITS = {
  quality: 40,
  engagement: 55,
  freshness: 5,
  total: 100,
  freshnessDays: 14,
} as const;

export const PRESET_PUBLICATION_RULES = {
  minimumTitleCharacters: 2,
  maximumTitleSymbols: MAX_PRESET_TITLE_SYMBOLS,
  maximumTitleCharacters: MAX_PRESET_TITLE_CHARACTERS,
  minimumDescriptionCharacters: 40,
  maximumDescriptionCharacters: MAX_PRESET_DESCRIPTION_CHARACTERS,
  maximumPlaylistNameSymbols: MAX_PLAYLIST_NAME_SYMBOLS,
  maximumPlaylistNameCharacters: MAX_PLAYLIST_NAME_CHARACTERS,
  maximumSwapperNameSymbols: MAX_SWAPPER_NAME_SYMBOLS,
  maximumSwapperNameCharacters: MAX_SWAPPER_NAME_CHARACTERS,
  minimumVersions: 1,
  maximumVersions: MAX_PRESET_VERSIONS,
  minimumMapPlaylists: MIN_MAP_PLAYLISTS,
  maximumMapPlaylists: MAX_MAP_PLAYLISTS,
  maximumSwapperConfigurations: MAX_SWAPPER_CONFIGURATIONS,
  minimumRandomizedWeapons: MIN_RANDOMIZED_WEAPONS,
  maximumRandomizedWeapons: MAX_RANDOMIZED_WEAPONS,
  minimumTags: 2,
  maximumTags: MAX_PRESET_TAGS,
} as const;

export type PresetContentSignals = {
  title: string;
  description: string;
  hasThumbnail: boolean;
  versionCount: number;
  mapPlaylistCount: number;
  mapPlaylistWithDescriptionCount: number;
  tagCount: number;
  weaponConfigurationCount: number;
};

export type InteractionSignals = {
  total: number;
  uniqueAnonymous: number;
  uniqueAuthenticated: number;
};

export type PresetEngagementSignals = {
  opens: InteractionSignals;
  linkOpens: InteractionSignals;
  copies: InteractionSignals;
};

export type PublicationValidation = {
  publishable: boolean;
  validationErrors: string[];
};

export type RankingBreakdown = {
  quality: number;
  engagement: number;
  freshness: number;
  total: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const boundedCount = (value: number) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
const roundScore = (value: number) => Math.round(value * 1_000) / 1_000;

function logarithmicPoints(value: number, pointsAtSaturation: number, maximumPoints: number) {
  const boundedValue = Math.max(0, Number.isFinite(value) ? value : 0);
  const normalized = Math.log1p(boundedValue) / Math.log1p(pointsAtSaturation);
  return maximumPoints * clamp(normalized, 0, 1);
}

export function validatePresetPublication(content: PresetContentSignals): PublicationValidation {
  const validationErrors: string[] = [];
  if (content.title.trim().length < PRESET_PUBLICATION_RULES.minimumTitleCharacters) validationErrors.push("Add a preset name");
  if (content.description.trim().length < PRESET_PUBLICATION_RULES.minimumDescriptionCharacters) validationErrors.push(`Add a description of at least ${PRESET_PUBLICATION_RULES.minimumDescriptionCharacters} characters`);
  if (boundedCount(content.versionCount) < PRESET_PUBLICATION_RULES.minimumVersions) validationErrors.push("Add a preset version");
  if (boundedCount(content.mapPlaylistCount) < PRESET_PUBLICATION_RULES.minimumMapPlaylists) validationErrors.push("Add a map playlist");
  if (boundedCount(content.tagCount) < PRESET_PUBLICATION_RULES.minimumTags) validationErrors.push(`Choose at least ${PRESET_PUBLICATION_RULES.minimumTags} tags`);
  if (boundedCount(content.tagCount) > PRESET_PUBLICATION_RULES.maximumTags) validationErrors.push(`Choose at most ${PRESET_PUBLICATION_RULES.maximumTags} tags`);
  return { publishable: validationErrors.length === 0, validationErrors };
}

/**
 * Calculates preset content completeness and polish score (0–40 points).
 * Focuses on meaningful quality signals (thumbnail, tags, clear descriptions, map pool descriptions)
 * without penalizing compact, laser-focused presets.
 */
export function calculateQualityScore(content: PresetContentSignals) {
  const publication = validatePresetPublication(content);
  const descLen = content.description.trim().length;

  // 1. Base publishable standard (5 pts)
  const baseScore = publication.publishable ? 5 : 0;

  // 2. Custom thumbnail (8 pts)
  const thumbnailScore = content.hasThumbnail ? 8 : 0;

  // 3. Tags (8 pts max) - 2 tags = 3 pts, 3-4 tags = 5 pts, 5-6 tags = 7 pts, 7-8 tags = 8 pts
  const tagCount = clamp(boundedCount(content.tagCount), 0, PRESET_PUBLICATION_RULES.maximumTags);
  const tagScore = tagCount === 0 ? 0
    : tagCount === 1 ? 1.5
    : tagCount === 2 ? 3
    : tagCount <= 4 ? 3 + (tagCount - 2) * 1.0
    : tagCount <= 6 ? 5 + (tagCount - 4) * 1.0
    : 7 + (tagCount - 6) * 0.5;

  // 4. Description depth (7 pts max) - 40-80 chars (2 pts), 80-160 chars (5 pts), 160-250+ chars (7 pts)
  const descScore = descLen < 40 ? 0
    : descLen <= 80 ? 2 * ((descLen - 40) / 40)
    : descLen <= 160 ? 2 + 3 * ((descLen - 80) / 80)
    : descLen <= 250 ? 5 + 2 * ((descLen - 160) / 90)
    : 7;

  // 5. Map Playlist & Descriptions (6 pts max)
  // 1 playlist with custom description = 5 pts (sweet spot), 2+ playlists with descriptions = 6 pts
  const playlistCount = boundedCount(content.mapPlaylistCount);
  const playlistWithDesc = boundedCount(content.mapPlaylistWithDescriptionCount);
  const playlistBase = playlistCount >= 1 ? 2 : 0;
  const playlistDescBonus = playlistWithDesc >= 1 ? 3 : 0;
  const multiPlaylistBonus = playlistCount >= 2 && playlistWithDesc >= 2 ? 1 : 0;
  const playlistScore = playlistBase + playlistDescBonus + multiPlaylistBonus;

  // 6. Weapon configuration setup (4 pts max)
  const weaponScore = boundedCount(content.weaponConfigurationCount) >= 1 ? 4 : 0;

  // 7. Version maintenance (2 pts max)
  const versionScore = boundedCount(content.versionCount) >= 2 ? 2 : 0;

  const totalQuality = baseScore + thumbnailScore + tagScore + descScore + playlistScore + weaponScore + versionScore;
  return roundScore(clamp(totalQuality, 0, PRESET_RANKING_LIMITS.quality));
}

/**
 * Calculates effective interaction value with anti-abuse dampening.
 * Authenticated Discord users receive 2.0x weight, anonymous unique actors receive 1.0x,
 * and repeat clicks from the same actor flatline quickly to prevent self-boosting.
 */
export function calculateEffectiveInteractions(signals: InteractionSignals) {
  const total = boundedCount(signals.total);
  const anonymous = boundedCount(signals.uniqueAnonymous);
  const authenticated = boundedCount(signals.uniqueAuthenticated);
  const unique = anonymous + authenticated;
  const repeats = Math.max(0, total - unique);
  const repeatCredit = Math.min(repeats * 0.02, 0.5);
  return anonymous * 1.0 + authenticated * 2.0 + repeatCredit;
}

/**
 * Calculates engagement score (0–55 points).
 * Rebalanced for a small-community browsing dynamic:
 * - Copies: 28 pts (primary intent action, saturating around 25 copies)
 * - Card Opens / Views: 20 pts (browsing interest, saturating around 35 unique viewers)
 * - Direct Link Referrals: 7 pts (external shares from Discord/forums, saturating around 10 visitors)
 */
export function calculateEngagementScore(signals: PresetEngagementSignals) {
  const copies = logarithmicPoints(calculateEffectiveInteractions(signals.copies), 25, 28);
  const opens = logarithmicPoints(calculateEffectiveInteractions(signals.opens), 35, 20);
  const linkOpens = logarithmicPoints(calculateEffectiveInteractions(signals.linkOpens), 10, 7);
  return roundScore(clamp(copies + opens + linkOpens, 0, PRESET_RANKING_LIMITS.engagement));
}

/**
 * Calculates freshness boost (0–5 points) decaying linearly over 14 days.
 */
export function calculateFreshnessScore(publishedAt: Date | number | string | null, now: Date | number = Date.now()) {
  if (publishedAt === null) return 0;
  const publishedTime = publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(publishedTime) || !Number.isFinite(nowTime)) return 0;
  const ageDays = Math.max(0, nowTime - publishedTime) / (24 * 60 * 60 * 1_000);
  return roundScore(PRESET_RANKING_LIMITS.freshness * clamp(1 - ageDays / PRESET_RANKING_LIMITS.freshnessDays, 0, 1));
}

export function calculatePresetRanking(
  content: PresetContentSignals,
  engagement: PresetEngagementSignals,
  publishedAt: Date | number | string | null,
  now: Date | number = Date.now(),
): RankingBreakdown {
  const quality = calculateQualityScore(content);
  const engagementScore = calculateEngagementScore(engagement);
  const freshness = calculateFreshnessScore(publishedAt, now);
  return { quality, engagement: engagementScore, freshness, total: roundScore(quality + engagementScore + freshness) };
}

export function scoreToMilli(score: number) {
  return Math.round(clamp(score, 0, PRESET_RANKING_LIMITS.total) * 1_000);
}
