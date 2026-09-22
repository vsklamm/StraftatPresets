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
import { stripColorAndFormattingTags } from "./straftat-markup";

export const PRESET_RANKING_VERSION = 4;
export const RANKING_DAY_MS = 86_400_000;

export const PRESET_RANKING_LIMITS = {
  quality: 37,
  engagement: 44,
  freshness: 12,
  surge: 16,
  lucky: 24,
  total: 133,
  freshnessDays: 3,
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
  mapPlaylistDescriptionLength: number;
  tagCount: number;
  weaponConfigurationCount: number;
};

export type InteractionSignals = {
  total: number;
  uniqueAnonymous: number;
  uniqueAuthenticated: number;
  /** Ranking-only sum of time-decayed distinct actors. Public counters stay unchanged. */
  effective?: number;
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
  surge: number;
  lucky: number;
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

function extendedLogarithmicPoints(value: number, threshold: number, pointsAtThreshold: number, maximumPoints: number) {
  const count = Math.max(0, Number.isFinite(value) ? value : 0);
  if (count <= threshold) return logarithmicPoints(count, threshold, pointsAtThreshold);
  const headroom = maximumPoints - pointsAtThreshold;
  const scale = headroom * (1 + threshold) * Math.log1p(threshold) / pointsAtThreshold;
  return pointsAtThreshold + headroom * -Math.expm1(-(count - threshold) / scale);
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

export function calculateQualityScore(content: PresetContentSignals) {
  const visibleDescription = stripColorAndFormattingTags(content.description).trim();
  const publication = validatePresetPublication({ ...content, title: stripColorAndFormattingTags(content.title), description: visibleDescription });
  const descLen = visibleDescription.length;

  const baseScore = publication.publishable ? 5 : 0;
  const thumbnailScore = content.hasThumbnail ? 6 : 0;

  // Extra tags after four have geometrically diminishing marginal credit.
  const tagCount = clamp(boundedCount(content.tagCount), 0, PRESET_PUBLICATION_RULES.maximumTags);
  const tagScore = tagCount === 0 ? 0
    : tagCount === 1 ? 1.5
    : tagCount === 2 ? 3
    : tagCount === 3 ? 4
    : 6 - 2 ** (-(tagCount - 4));

  const descScore = descLen < 40 ? 0 : 9 * Math.min(1, Math.log1p(descLen / 80) / Math.log1p(250 / 80));

  const playlistCount = Math.min(7, boundedCount(content.mapPlaylistCount));
  const playlistBase = playlistCount >= 1 ? 2 + 0.4 * (playlistCount - 1) : 0;
  const playlistDescBonus = playlistCount >= 1 ? 2 * Math.min(1, boundedCount(content.mapPlaylistDescriptionLength) / 40) : 0;
  const playlistScore = playlistBase + playlistDescBonus;

  const weaponScore = boundedCount(content.weaponConfigurationCount) >= 1 ? 3 : 0;

  const versionCount = Math.min(10, boundedCount(content.versionCount));
  const versionScore = versionCount >= 2 ? 1.5 + 0.05 * Math.log2(versionCount - 1) : 0;

  const totalQuality = baseScore + thumbnailScore + tagScore + descScore + playlistScore + weaponScore + versionScore;
  return roundScore(clamp(totalQuality, 0, PRESET_RANKING_LIMITS.quality));
}

/**
 * Repeats never multiply credit. Projection supplies the recency-weighted actor sum.
 */
export function calculateEffectiveInteractions(signals: InteractionSignals) {
  if (signals.effective !== undefined) return Math.max(0, Number.isFinite(signals.effective) ? signals.effective : 0);
  const anonymous = boundedCount(signals.uniqueAnonymous);
  const authenticated = boundedCount(signals.uniqueAuthenticated);
  return anonymous + authenticated * 2.5;
}

export function calculateEngagementScore(signals: PresetEngagementSignals) {
  const copies = extendedLogarithmicPoints(calculateEffectiveInteractions(signals.copies), 25, 28, 31);
  const opens = extendedLogarithmicPoints(calculateEffectiveInteractions(signals.opens), 35, 9, 10);
  const linkOpens = logarithmicPoints(calculateEffectiveInteractions(signals.linkOpens), 10, 3);
  return roundScore(clamp(copies + opens + linkOpens, 0, PRESET_RANKING_LIMITS.engagement));
}

export function calculateFreshnessScore(publishedAt: Date | number | string | null, now: Date | number = Date.now()) {
  if (publishedAt === null) return 0;
  const publishedTime = publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(publishedTime) || !Number.isFinite(nowTime)) return 0;
  const ageDays = Math.max(0, nowTime - publishedTime) / (24 * 60 * 60 * 1_000);
  return roundScore(PRESET_RANKING_LIMITS.freshness * 2 ** (-ageDays / PRESET_RANKING_LIMITS.freshnessDays));
}

export function calculatePresetRanking(
  content: PresetContentSignals,
  engagement: PresetEngagementSignals,
  publishedAt: Date | number | string | null,
  now: Date | number = Date.now(),
  bonuses: { surge: number; lucky: number } = { surge: 0, lucky: 0 },
): RankingBreakdown {
  const quality = calculateQualityScore(content);
  const engagementScore = calculateEngagementScore(engagement);
  const freshness = calculateFreshnessScore(publishedAt, now);
  const surge = roundScore(clamp(bonuses.surge, 0, PRESET_RANKING_LIMITS.surge));
  const lucky = roundScore(clamp(bonuses.lucky, 0, PRESET_RANKING_LIMITS.lucky));
  return { quality, engagement: engagementScore, freshness, surge, lucky, total: roundScore(quality + engagementScore + freshness + surge + lucky) };
}

export function scoreToMilli(score: number) {
  return Math.round(clamp(score, 0, PRESET_RANKING_LIMITS.total) * 1_000);
}
