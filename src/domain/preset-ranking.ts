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
  quality: 70,
  engagement: 26,
  freshness: 4,
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

export function calculateQualityScore(content: PresetContentSignals) {
  const publication = validatePresetPublication(content);
  const descriptionLength = content.description.trim().length;
  const score =
    (publication.publishable ? 20 : 0) +
    (content.hasThumbnail ? 10 : 0) +
    logarithmicPoints(content.versionCount, 5, 10) +
    clamp(boundedCount(content.tagCount), 0, PRESET_PUBLICATION_RULES.maximumTags) * 1.5 +
    logarithmicPoints(content.mapPlaylistCount, 5, 10) +
    (boundedCount(content.mapPlaylistWithDescriptionCount) > 0 ? 3 : 0) +
    (boundedCount(content.weaponConfigurationCount) > 0 ? 4 : 0) +
    4 * clamp((descriptionLength - PRESET_PUBLICATION_RULES.minimumDescriptionCharacters) / 190, 0, 1);
  return roundScore(clamp(score, 0, PRESET_RANKING_LIMITS.quality));
}

export function calculateEffectiveInteractions(signals: InteractionSignals) {
  const total = boundedCount(signals.total);
  const anonymous = boundedCount(signals.uniqueAnonymous);
  const authenticated = boundedCount(signals.uniqueAuthenticated);
  const unique = anonymous + authenticated;
  const repeats = Math.max(0, total - unique);
  const repeatCredit = Math.min(repeats * 0.05, unique * 0.5);
  return anonymous + authenticated * 1.5 + repeatCredit;
}

function calculateEngagementScore(signals: PresetEngagementSignals) {
  const copies = logarithmicPoints(calculateEffectiveInteractions(signals.copies), 10_000, 18);
  const opens = logarithmicPoints(calculateEffectiveInteractions(signals.opens), 40, 5);
  const linkOpens = logarithmicPoints(calculateEffectiveInteractions(signals.linkOpens), 20, 3);
  return roundScore(clamp(copies + opens + linkOpens, 0, PRESET_RANKING_LIMITS.engagement));
}

export function calculateFreshnessScore(publishedAt: Date | number | string | null, now: Date | number = Date.now()) {
  if (publishedAt === null) return 0;
  const publishedTime = publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(publishedTime) || !Number.isFinite(nowTime)) return 0;
  const ageDays = Math.max(0, nowTime - publishedTime) / (24 * 60 * 60 * 1_000);
  return roundScore(PRESET_RANKING_LIMITS.freshness * clamp(1 - ageDays / PRESET_RANKING_LIMITS.freshnessDays, 0, 1));
}

export function calculatePresetRanking(content: PresetContentSignals, engagement: PresetEngagementSignals, publishedAt: Date | number | string | null, now: Date | number = Date.now()): RankingBreakdown {
  const quality = calculateQualityScore(content);
  const engagementScore = calculateEngagementScore(engagement);
  const freshness = calculateFreshnessScore(publishedAt, now);
  return { quality, engagement: engagementScore, freshness, total: roundScore(quality + engagementScore + freshness) };
}

export function scoreToMilli(score: number) {
  return Math.round(clamp(score, 0, PRESET_RANKING_LIMITS.total) * 1_000);
}
