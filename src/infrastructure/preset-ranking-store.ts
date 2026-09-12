import { PRESET_RANKING_VERSION, RANKING_DAY_MS } from "../domain/preset-ranking";
import { buildRankingProjection, selectDailyWinners, type DailyWinners, type RankedPreset, type RankingEvent, type RankingPreset } from "../domain/preset-ranking-projection";

export type RankingQuery = <T>(statement: string, params?: readonly (string | number | null)[]) => Promise<T[]>;
export type RankingProjection = { version: number; generatedAt: number; expiresAt: number; items: RankedPreset[] };
type CacheRow = { generation: number; formula_version: number; generated_at: number; expires_at: number; payload: string | null };
type PresetRow = RankingPreset & { status: string };

/** Shared by the Worker and administrative CLI. No per-preset DB reads or secret-bearing output. */
export class PresetRankingStore {
  constructor(private readonly query: RankingQuery, private readonly hash: (value: string) => Promise<string>) {}

  async get(now = Date.now(), force = false): Promise<RankingProjection> {
    const day = new Date(now).toISOString().slice(0, 10);
    const dayStart = Math.floor(now / RANKING_DAY_MS) * RANKING_DAY_MS;
    for (let attempt = 0; attempt < 3; attempt++) {
      const [cache] = await this.query<CacheRow>("SELECT * FROM preset_ranking_cache WHERE id = 1");
      if (!cache) throw new Error("Ranking migration has not been applied.");
      // A concurrent request may have started later and already saved a newer
      // snapshot. Reuse it instead of trying to move the cache clock backwards.
      if (!force && cache.payload && cache.formula_version === PRESET_RANKING_VERSION && cache.expires_at > now) {
        return JSON.parse(cache.payload) as RankingProjection;
      }
      const [presets, events, tags] = await Promise.all([
        this.query<PresetRow>(`SELECT p.id, p.slug, p.author_id AS authorId, p.status,
          p.first_published_at AS firstPublishedAt, r.content_json AS contentJson
          FROM presets p LEFT JOIN preset_revisions r ON r.id = p.published_revision_id`),
        this.query<RankingEvent>(`SELECT preset_id AS presetId, actor_hash AS actorHash, kind,
          is_authenticated AS isAuthenticated, created_at AS createdAt FROM preset_events WHERE is_invalidated = 0`),
        this.query<{ slug: string }>("SELECT slug FROM tags"),
      ]);
      const authorHashes = new Map(await Promise.all([...new Set(presets.map((p) => p.authorId))].map(async (id) => [id, await this.hash(`user:${id}`)] as const)));
      const owners = new Map(presets.map((p) => [p.id, authorHashes.get(p.authorId)]));
      const visible = presets.filter((p) => p.status === "published" && p.contentJson);
      const winners = await this.winners(day, visible.filter((p) => p.firstPublishedAt !== null && p.firstPublishedAt < dayStart).map((p) => p.id));
      // Retain historical comparison cohorts when a preset is hidden. Events were
      // accepted while public. Invalidation/deletion still recomputes every day's M.
      const eligible = events.filter((e) => owners.has(e.presetId) && !(e.isAuthenticated && owners.get(e.presetId) === e.actorHash));
      const projection: RankingProjection = {
        version: PRESET_RANKING_VERSION, generatedAt: now,
        expiresAt: Math.min(now + 5 * 60_000, dayStart + RANKING_DAY_MS),
        items: buildRankingProjection(visible, eligible, new Set(tags.map((t) => t.slug)), winners, now),
      };
      // Compare-and-swap prevents an in-flight calculation from resurrecting a
      // publication/event invalidated while its inputs were being read.
      const saved = await this.query<{ id: number }>(`UPDATE preset_ranking_cache
        SET formula_version = ?, generated_at = ?, expires_at = ?, payload = ?
        WHERE id = 1 AND generation = ? AND generated_at <= ? RETURNING id`,
      [projection.version, now, projection.expiresAt, JSON.stringify(projection), cache.generation, now]);
      if (saved.length) return projection;
      force = false;
    }
    throw new Error("Ranking changed during recalculation. Please retry.");
  }

  private async winners(day: string, pool: string[]): Promise<DailyWinners> {
    const read = () => this.query<DailyWinners>("SELECT first_preset_id AS first, second_preset_id AS second FROM preset_ranking_lottery WHERE day = ?", [day]);
    let [winners] = await read();
    if (!winners) {
      const drawn = await selectDailyWinners(pool, day, this.hash);
      await this.query("INSERT INTO preset_ranking_lottery (day, first_preset_id, second_preset_id) VALUES (?, ?, ?) ON CONFLICT(day) DO NOTHING", [day, drawn.first, drawn.second]);
      [winners] = await read();
    }
    if (!winners) throw new Error("Daily ranking lottery could not be loaded.");
    return winners;
  }
}
