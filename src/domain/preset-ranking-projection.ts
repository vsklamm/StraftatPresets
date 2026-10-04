import { parsePresetRevisionContent, type PresetRevisionContent } from "./preset-content";
import { sortPresetVersionsNewestFirst } from "./preset-version";
import { stripColorAndFormattingTags } from "./straftat-markup";
import { calculatePresetRanking, PRESET_RANKING_LIMITS, RANKING_DAY_MS, scoreToMilli, type PresetContentSignals, type PresetEngagementSignals, type RankingBreakdown } from "./preset-ranking";

export type RankingPreset = {
  id: string;
  slug: string;
  authorId: string;
  firstPublishedAt: number | null;
  contentJson: string;
};
export type RankingEvent = {
  presetId: string;
  actorHash: string;
  kind: "view" | "link_open" | "copy";
  isAuthenticated: boolean;
  createdAt: number;
};
export type RankedPreset = Omit<RankingPreset, "contentJson"> & RankingBreakdown & { score: number };
export type DailyWinners = { first: string | null; second: string | null };

const normalizePlaylistText = (text: string) => stripColorAndFormattingTags(text).normalize("NFKC").toLowerCase().trim().replace(/\s+/gu, " ");

export function rankingContentSignals(content: PresetRevisionContent, canonicalTags: ReadonlySet<string>): PresetContentSignals {
  const latest = sortPresetVersionsNewestFirst(content.versions)[0];
  const playlists = latest?.mapPlaylists.filter((playlist) => playlist.mapNames.length > 0 && playlist.encodedValue.trim()) ?? [];
  const pools = new Set(playlists.map((playlist) => JSON.stringify([...new Set(playlist.mapNames)].sort())));
  const descriptionLength = Math.max(0, ...playlists.map((playlist) =>
    normalizePlaylistText(playlist.description) === normalizePlaylistText(playlist.name)
      ? 0 : stripColorAndFormattingTags(playlist.description).trim().length));
  const mapCount = new Set(playlists[0]?.mapNames).size;
  return {
    title: stripColorAndFormattingTags(content.title),
    description: stripColorAndFormattingTags(content.description),
    hasThumbnail: Boolean(content.thumbnailKey),
    versionCount: content.versioningEnabled ? content.versions.length : Math.min(1, content.versions.length),
    mapPlaylistCount: pools.size,
    mapPlaylistDescriptionLength: descriptionLength,
    tagCount: new Set(content.tags.filter((tag) => canonicalTags.has(tag))).size,
    weaponConfigurationCount: latest?.weaponConfigurations.filter((configuration) => configuration.kind === "randomized"
      ? configuration.weapons.length > 0 : configuration.encodedValue.trim().length > 0).length ?? 0,
    isSimple: content.versions.length === 1 && latest.mapPlaylists.length === 1
      && playlists.length === 1 && mapCount >= 1 && mapCount <= 4,
  };
}

export function dailySurgePoints(actors: number, maximum: number) {
  if (actors <= 1) return 0;
  return 16 * (1 - Math.exp(-(actors - 1) / 3)) * Math.sqrt(actors / Math.max(3, maximum, actors));
}

/** Input events are accepted, non-invalidated, non-owner rows. Never expose them in the projection. */
export function buildRankingProjection(
  presets: readonly RankingPreset[], events: readonly RankingEvent[], canonicalTags: ReadonlySet<string>,
  winners: DailyWinners, now: number,
): RankedPreset[] {
  const metrics = new Map<string, Record<keyof PresetEngagementSignals, Map<string, RankingEvent>>>();
  const days = new Map<number, Map<string, Set<string>>>();
  for (const event of events) {
    if (!Number.isFinite(event.createdAt) || event.createdAt > now) continue;
    let presetMetrics = metrics.get(event.presetId);
    if (!presetMetrics) {
      presetMetrics = { opens: new Map(), linkOpens: new Map(), copies: new Map() };
      metrics.set(event.presetId, presetMetrics);
    }
    const keys: (keyof PresetEngagementSignals)[] = event.kind === "copy" ? ["copies"] : event.kind === "link_open" ? ["opens", "linkOpens"] : ["opens"];
    for (const key of keys) {
      const previous = presetMetrics[key].get(event.actorHash);
      if (!previous || previous.createdAt < event.createdAt) presetMetrics[key].set(event.actorHash, event);
    }
    if (event.kind === "copy") {
      const day = Math.floor(event.createdAt / RANKING_DAY_MS);
      const dayPresets = days.get(day) ?? new Map<string, Set<string>>();
      const actors = dayPresets.get(event.presetId) ?? new Set<string>();
      actors.add(event.actorHash);
      dayPresets.set(event.presetId, actors);
      days.set(day, dayPresets);
    }
  }
  const ranked = presets.map((preset) => {
    const effective = (key: keyof PresetEngagementSignals) => {
      let sum = 0;
      for (const actor of metrics.get(preset.id)?.[key].values() ?? []) {
        sum += (actor.isAuthenticated ? 2.5 : 1) * 2 ** (-(now - actor.createdAt) / (30 * RANKING_DAY_MS));
      }
      return { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0, effective: sum };
    };
    const ranking = calculatePresetRanking(
      rankingContentSignals(parsePresetRevisionContent(JSON.parse(preset.contentJson)), canonicalTags),
      { opens: effective("opens"), linkOpens: effective("linkOpens"), copies: effective("copies") },
      preset.firstPublishedAt, now,
    );
    return { id: preset.id, slug: preset.slug, authorId: preset.authorId, firstPublishedAt: preset.firstPublishedAt, ...ranking, score: ranking.total };
  });
  const leaders = new Set([...ranked].sort(compareRankedPresets).slice(0, 4).map((preset) => preset.id));
  const surges = new Map<string, number>();
  for (const [day, dayPresets] of days) {
    const maximum = Math.max(3, ...[...dayPresets.values()].map((actors) => actors.size));
    const ageDays = Math.max(0, now - (day + 1) * RANKING_DAY_MS) / RANKING_DAY_MS;
    for (const [id, actors] of dayPresets) {
      const leader = leaders.has(id);
      const decay = 2 ** (-ageDays / (leader ? 1 : 1.5));
      const points = dailySurgePoints(actors.size, maximum) * decay * (leader ? 0.5 : 1.1);
      surges.set(id, Math.max(surges.get(id) ?? 0, points));
    }
  }
  return ranked.map((preset) => {
    const raw = surges.get(preset.id) ?? 0;
    const surge = raw < 0.05 ? 0 : Math.round(Math.min(PRESET_RANKING_LIMITS.surge, raw) * 1_000) / 1_000;
    const lucky = (winners.first === preset.id ? 16 : 0) + (winners.second === preset.id ? 8 : 0);
    const total = scoreToMilli(preset.total + surge + lucky) / 1_000;
    return { ...preset, surge, lucky, total, score: total };
  }).sort(compareRankedPresets);
}

export function compareRankedPresets(left: RankedPreset, right: RankedPreset) {
  return right.score - left.score || right.quality - left.quality || left.id.localeCompare(right.id);
}

/** Apply once to the full, unfiltered score order, before pagination. */
export function applyLaunchPlacement<T extends Pick<RankedPreset, "id" | "authorId" | "firstPublishedAt">>(ordered: readonly T[], now: number): T[] {
  if (ordered.length < 6) return [...ordered];
  const eligible = (preset: T) => preset.firstPublishedAt !== null && preset.firstPublishedAt <= now && now - preset.firstPublishedAt < 3 * RANKING_DAY_MS;
  const anchors = new Map(ordered.slice(0, 6).flatMap((preset, index) => eligible(preset) ? [[index, preset] as const] : []));
  if (anchors.size >= 2) return [...ordered];
  const authors = new Set([...anchors.values()].map((preset) => preset.authorId));
  const queue = ordered.slice(6).filter(eligible).sort((a, b) => a.firstPublishedAt! - b.firstPublishedAt! || a.id.localeCompare(b.id));
  const capacity = 2 - anchors.size;
  const start = queue.length > capacity ? Math.floor(now / RANKING_DAY_MS) % queue.length : 0;
  const chosen: T[] = [];
  for (let i = 0; i < queue.length && chosen.length < capacity; i++) {
    const preset = queue[(start + i) % queue.length];
    if (authors.has(preset.authorId)) continue;
    chosen.push(preset);
    authors.add(preset.authorId);
  }
  if (!chosen.length) return [...ordered];
  const positions = anchors.size === 0 ? [2, 5] : [anchors.has(5) ? 4 : 5];
  chosen.forEach((preset, index) => anchors.set(positions[index], preset));
  const fixedIds = new Set([...anchors.values()].map((preset) => preset.id));
  const remaining = ordered.filter((preset) => !fixedIds.has(preset.id));
  let index = 0;
  return ordered.map((_, position) => anchors.get(position) ?? remaining[index++]);
}

export async function selectDailyWinners(ids: readonly string[], day: string, hash: (value: string) => Promise<string>): Promise<DailyWinners> {
  const draws = await Promise.all([1, 2].map(async (draw) => {
    const entries = await Promise.all(ids.map(async (id) => ({ id, key: await hash(`ranking-luck:v2:${day}:${draw}:${id}`) })));
    entries.sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    return entries[0]?.id ?? null;
  }));
  return { first: draws[0], second: draws[1] };
}
