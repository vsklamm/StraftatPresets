import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createDatabase } from "../db";
import { D1Repository } from "../src/infrastructure/d1-repository";
import { PresetRankingStore, type RankingQuery } from "../src/infrastructure/preset-ranking-store";
import { analyticsHash } from "../src/lib/analytics-hash";
import { applyLaunchPlacement, buildRankingProjection, dailySurgePoints, rankingContentSignals, selectDailyWinners, type RankingEvent, type RankingPreset } from "../src/domain/preset-ranking-projection";
import { calculateEngagementScore, calculateFreshnessScore, calculateQualityScore, RANKING_DAY_MS as DAY, scoreToMilli } from "../src/domain/preset-ranking";
import { type PresetRevisionContent } from "../src/domain/preset-content";
import { bindRankingSql } from "../scripts/ranking-sql";

const now = Date.UTC(2026, 8, 12, 12);
const tags = new Set(["a", "b", "c", "d", "e", "f", "g", "h"]);
const content: PresetRevisionContent = {
  title: "Ranking fixture", description: "A carefully described fixture for ranked presets with enough visible text.",
  thumbnailKey: null, tags: ["a", "b"], versioningEnabled: false,
  versions: [{ label: "v1.0", mapPlaylists: [{ name: "Maps", description: "", encodedValue: "code", mapNames: ["Map"] }], weaponConfigurations: [] }],
};
const preset = (id = "p"): RankingPreset => ({ id, slug: id, authorId: `author-${id}`, firstPublishedAt: now - DAY, contentJson: JSON.stringify(content) });
const event = (actorHash: string, kind: RankingEvent["kind"] = "copy", createdAt = now): RankingEvent => ({ presetId: "p", actorHash, kind, createdAt, isAuthenticated: false });
const projection = (events: RankingEvent[], time = now) => buildRankingProjection([preset()], events, tags, { first: null, second: null }, time)[0];
const hash = async (value: string) => createHash("sha256").update(value).digest("hex");
const migrationFiles = readdirSync("db/init").filter((name) => name.endsWith(".sql")).sort();

function fixture(upgrade = false) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of upgrade ? migrationFiles.slice(0, -1) : migrationFiles) db.exec(readFileSync(`db/init/${file}`, "utf8"));
  const statements: string[] = [];
  const query: RankingQuery = async <T>(sql: string, params: readonly (string | number | null)[] = []) => {
    statements.push(sql);
    return db.prepare(sql).all(...params) as T[];
  };
  if (!upgrade) for (const slug of tags) db.prepare("INSERT INTO tags (slug, label) VALUES (?, ?)").run(slug, slug);
  const add = (id = "p", published = now - DAY) => {
    db.prepare("INSERT INTO users (id, name, preset_limit) VALUES (?, ?, 100)").run(`author-${id}`, `Author ${id}`);
    db.prepare("INSERT INTO presets (id, slug, author_id, title, status, published_at, published_revision_id) VALUES (?, ?, ?, ?, 'published', ?, ?)").run(id, id, `author-${id}`, id, published, `r-${id}`);
    db.prepare("INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES (?, ?, 1, 'published', ?, 'hash')").run(`r-${id}`, id, JSON.stringify(content));
  };
  const addEvent = (actor: string, at = now, options: { auth?: boolean; invalid?: boolean; presetId?: string; kind?: string; target?: string } = {}) => {
    db.prepare("INSERT INTO preset_events (id, preset_id, kind, actor_hash, is_authenticated, is_invalidated, dedupe_bucket, target_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), options.presetId ?? "p", options.kind ?? "copy", actor, options.auth ? 1 : 0, options.invalid ? 1 : 0, new Date(at).toISOString().slice(0, 10), options.target ?? "", at);
  };
  // Exercise the actual repository with SQLite prepared statements, not mocked scores.
  const binding = {
    prepare(sql: string) {
      const bound = (params: unknown[] = []) => ({
        bind: (...values: unknown[]) => bound(values),
        all: async () => ({ success: true, results: db.prepare(sql).all(...params as (string | number | null)[]), meta: {} }),
        raw: async () => { const s = db.prepare(sql); s.setReturnArrays(true); return s.all(...params as (string | number | null)[]); },
        run: async () => ({ success: true, results: [], meta: db.prepare(sql).run(...params as (string | number | null)[]) }),
      });
      return bound();
    },
  } as unknown as D1Database;
  return { db, query, statements, add, addEvent, repository: new D1Repository(createDatabase(binding)), store: new PresetRankingStore(query, hash) };
}

test("tag gains diminish after four, extra configurations and playlists give no extra credit", () => {
  const base = rankingContentSignals({ ...content, description: "x".repeat(40) }, tags);
  const points = Array.from({ length: 7 }, (_, i) => calculateQualityScore({ ...base, tagCount: i + 2 }));
  assert.deepEqual(points.map((p) => Math.round((p - points[0]) * 1000) / 1000), [0, 1, 2, 2.5, 2.75, 2.875, 2.938]);
  assert.equal(calculateQualityScore({ ...base, mapPlaylistCount: 1, mapPlaylistWithDescriptionCount: 1, weaponConfigurationCount: 1 }),
    calculateQualityScore({ ...base, mapPlaylistCount: 7, mapPlaylistWithDescriptionCount: 7, weaponConfigurationCount: 7 }));
});

test("quality uses latest semantic version, visible descriptions, canonical tags and enabled history", () => {
  const latest = { ...content.versions[0], label: "v10.0", mapPlaylists: [content.versions[0].mapPlaylists[0]] };
  const older = { ...content.versions[0], label: "v2.0", weaponConfigurations: [{ kind: "swapper" as const, name: "Old", encodedValue: "old" }] };
  const signals = rankingContentSignals({ ...content, tags: ["a", "a", "unknown"], versions: [older, latest] }, tags);
  assert.equal(signals.weaponConfigurationCount, 0);
  assert.equal(signals.tagCount, 1);
  assert.equal(signals.versionCount, 1);
  assert.equal(rankingContentSignals({ ...content, versioningEnabled: true, versions: [older, latest] }, tags).versionCount, 2);
  assert.equal(calculateQualityScore({ ...signals, description: `<b>${content.description}</b>` }), calculateQualityScore({ ...signals, description: content.description }));
});

test("copies dedupe across targets, opens union both kinds, repeats only refresh recency", () => {
  assert.equal(projection([event("a"), event("a")]).engagement, projection([event("a")]).engagement);
  const views = projection([event("a", "view"), event("a", "link_open")]);
  const expected = calculateEngagementScore({ opens: { total: 0, uniqueAnonymous: 1, uniqueAuthenticated: 0 }, linkOpens: { total: 0, uniqueAnonymous: 1, uniqueAuthenticated: 0 }, copies: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 } });
  assert.equal(views.engagement, expected);
  assert.equal(projection([event("a", "copy", now - 30 * DAY), event("a")]).engagement, projection([event("a")]).engagement);
  const decayed = projection([event("a", "copy", now - 30 * DAY)]);
  const effectiveHalf = calculateEngagementScore({ opens: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 }, linkOpens: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 }, copies: { total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0, effective: 0.5 } });
  assert.equal(decayed.engagement, effectiveHalf);
  assert.ok(projection([{ ...event("a"), isAuthenticated: true }]).engagement > projection([event("a")]).engagement);
});

test("surge handles sparse days, relative leaders, midnight continuity and a one-day half-life", () => {
  assert.equal(dailySurgePoints(1, 1), 0);
  assert.ok(Math.abs(dailySurgePoints(2, 3) - 3.703) < 0.001);
  assert.ok(Math.abs(dailySurgePoints(6, 13) - 8.817) < 0.001);
  for (let u = 2; u < 30; u++) assert.ok(dailySurgePoints(u, 30) < dailySurgePoints(u + 1, 30));
  const events = [event("a"), event("b")];
  const midnight = Math.floor(now / DAY) * DAY + DAY;
  assert.equal(projection(events, midnight - 1).surge, projection(events, midnight).surge);
  assert.ok(Math.abs(projection(events, midnight + DAY).surge - projection(events, midnight).surge / 2) < 0.001);
  assert.equal(projection([...events, ...events.map((e) => ({ ...e, createdAt: e.createdAt - DAY }))]).surge, projection(events).surge);
});

test("scores may exceed 100, never 135, and future timestamps do not amplify freshness", () => {
  const full = { ...preset(), firstPublishedAt: now, contentJson: JSON.stringify({ ...content, thumbnailKey: "image", description: "x".repeat(300), tags: [...tags] }) };
  const events = Array.from({ length: 100 }, (_, i) => [event(String(i)), event(String(i), "link_open")]).flat();
  const ranked = buildRankingProjection([full], events, tags, { first: "p", second: "p" }, now)[0];
  assert.ok(ranked.total > 100 && ranked.total <= 135);
  assert.equal(ranked.lucky, 24);
  assert.equal(scoreToMilli(ranked.total), Math.round(ranked.total * 1000));
  assert.equal(calculateFreshnessScore(now + DAY, now), 18);
  assert.equal(calculateFreshnessScore(null, now), 0);
});

test("lottery is deterministic, order independent, permits double wins and empty pools", async () => {
  assert.deepEqual(await selectDailyWinners([], "day", hash), { first: null, second: null });
  assert.deepEqual(await selectDailyWinners(["p"], "day", hash), { first: "p", second: "p" });
  assert.deepEqual(await selectDailyWinners(["a", "b", "c"], "day", hash), await selectDailyWinners(["c", "a", "b"], "day", hash));
});

test("launch placement fixes natural positions, preserves ordinary order and caps promoted authors", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ ...preset(String(i)), firstPublishedAt: now - (i >= 6 ? 1 : 10) * DAY }));
  rows[7].authorId = rows[6].authorId;
  const placed = applyLaunchPlacement(rows, now);
  assert.equal(new Set(placed.map((p) => p.id)).size, rows.length);
  assert.ok(Number(placed[2].id) >= 6 && Number(placed[5].id) >= 6);
  assert.notEqual(placed[2].authorId, placed[5].authorId);
  assert.deepEqual(placed.filter((p) => Number(p.id) < 6).map((p) => p.id), ["0", "1", "2", "3", "4", "5"]);
  rows[5].firstPublishedAt = now - DAY;
  const anchored = applyLaunchPlacement(rows, now);
  assert.equal(anchored[5].id, "5");
  assert.ok(Number(anchored[4].id) >= 6);
  rows[0].firstPublishedAt = now - DAY;
  assert.deepEqual(applyLaunchPlacement(rows, now), rows);
  assert.deepEqual(applyLaunchPlacement(rows.slice(0, 5), now), rows.slice(0, 5));
});

test("upgrade backfills earliest publication, ignores rejected reviews and preserves retracted history", () => {
  const f = fixture(true);
  try {
    f.add("p", now - 10 * DAY);
    f.db.exec(`UPDATE preset_revisions SET reviewed_at = ${now - 10 * DAY} WHERE id = 'r-p';
      UPDATE presets SET status = 'draft', published_at = NULL, retracted_at = ${now} WHERE id = 'p';
      UPDATE preset_revisions SET status = 'archived' WHERE id = 'r-p';
      INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash, reviewed_at)
        VALUES ('rejected', 'p', 2, 'rejected', '{}', 'hash', ${now - 20 * DAY});`);
    f.db.exec(readFileSync(`db/init/${migrationFiles.at(-1)}`, "utf8"));
    const first = () => f.db.prepare("SELECT first_published_at AS first FROM presets WHERE id = 'p'").get()?.first;
    assert.equal(first(), now - 10 * DAY);
    f.db.exec(`UPDATE presets SET status = 'published', published_at = ${now} WHERE id = 'p'`);
    assert.equal(first(), now - 10 * DAY);
    assert.throws(() => f.db.exec(`UPDATE presets SET first_published_at = ${now} WHERE id = 'p'`), /immutable/);
  } finally { f.db.close(); }
});

test("store excludes invalid and owner events, caches globally, invalidates immediately and refreshes old formula versions", async () => {
  const f = fixture();
  try {
    f.add();
    f.addEvent(await hash("user:author-p"), now, { auth: true });
    f.addEvent("invalid", now, { invalid: true });
    f.addEvent("reader");
    f.addEvent("reader", now, { target: "second-target" });
    const first = await f.store.get(now);
    assert.equal(first.items[0].engagement, projection([event("reader")]).engagement);
    assert.equal(first.items[0].surge, 0);
    const reads = f.statements.length;
    assert.deepEqual(await f.store.get(now + 1000), first);
    assert.equal(f.statements.length, reads + 1);
    f.db.exec("UPDATE preset_events SET is_invalidated = 1 WHERE actor_hash = 'reader'");
    assert.equal((await f.store.get(now + 2000)).items[0].engagement, 0);
    f.db.exec("UPDATE preset_ranking_cache SET formula_version = 2");
    assert.equal((await f.store.get(now + 3000)).version, 3);
    f.db.exec("UPDATE presets SET status = 'hidden' WHERE id = 'p'");
    assert.equal((await f.store.get(now + 4000)).items.length, 0);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM preset_events").get()?.n, 4);
  } finally { f.db.close(); }
});

test("lottery persists across concurrent refreshes and hiding a winner does not redraw", async () => {
  const f = fixture();
  try {
    f.add();
    const [a, b] = await Promise.all([f.store.get(now), new PresetRankingStore(f.query, hash).get(now)]);
    assert.deepEqual(a, b);
    assert.equal(a.items[0].lucky, 24);
    f.add("new", now);
    f.db.exec("UPDATE presets SET status = 'hidden' WHERE id = 'p'");
    assert.equal((await f.store.get(now + 1)).items[0].lucky, 0);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM preset_ranking_lottery").get()?.n, 1);
    const midnight = Math.floor(now / DAY) * DAY + DAY;
    assert.equal((await f.store.get(midnight)).items[0].lucky, 24);
  } finally { f.db.close(); }
});

test("invalidation during projection calculation cannot resurrect stale published content", async () => {
  const f = fixture();
  try {
    f.add();
    let changed = false;
    const store = new PresetRankingStore(f.query, async (value) => {
      if (!changed) { changed = true; f.db.exec("UPDATE presets SET status = 'hidden' WHERE id = 'p'"); }
      return hash(value);
    });
    assert.equal((await store.get(now)).items.length, 0);
  } finally { f.db.close(); }
});

test("a slower refresh reuses the newer snapshot saved by another request", async () => {
  const f = fixture();
  try {
    f.add();
    let raced = false;
    const slow = new PresetRankingStore(f.query, async (value) => {
      if (!raced) { raced = true; await f.store.get(now + 1000); }
      return hash(value);
    });
    assert.equal((await slow.get(now)).generatedAt, now + 1000);
  } finally { f.db.close(); }
});

test("dashboard and order endpoint share projection before pagination and ignore draft content", async () => {
  const f = fixture();
  try {
    const time = Date.now();
    f.add("a", time - 20 * DAY); f.add("b", time - 10 * DAY);
    f.db.exec("UPDATE presets SET title = 'Private draft', description = 'Private draft' WHERE id = 'a'");
    f.addEvent("reader", time - 1000, { presetId: "a" });
    await new PresetRankingStore(f.query, analyticsHash).get(time);
    const dashboard = await f.repository.listDashboardPresets("popular", undefined, 48, 0);
    const order = await f.repository.listRankedPresetOrder(48, 0, new Date(time));
    assert.deepEqual(dashboard.items.map((p) => p.id), order.items.map((p) => p.id));
    assert.equal(dashboard.items.find((p) => p.id === "a")?.content.title, content.title);
    const page = await f.repository.listDashboardPresets("popular", undefined, 1, 1);
    assert.equal(page.items[0].id, order.items[1].id);
  } finally { f.db.close(); }
});

test("search keeps relevance first and uses score ties without launch promotions", async () => {
  const f = fixture();
  try {
    const time = Date.now();
    for (let i = 0; i < 8; i++) {
      const id = String(i);
      f.add(id, time - (i >= 6 ? 1 : 20) * DAY);
      f.db.prepare("INSERT INTO preset_search_documents (preset_id, published_revision_id, schema_version, title, author, description, secondary_text) VALUES (?, ?, 1, 'Fixture', 'Author', 'Fixture', '')").run(id, `r-${id}`);
      f.db.prepare("INSERT INTO preset_tags (preset_id, tag_slug, position) VALUES (?, 'a', 0)").run(id);
      if (i < 6) for (let actor = 0; actor < 25; actor++) f.addEvent(`reader-${actor}`, time - 1000, { presetId: id });
    }
    const ranked = await new PresetRankingStore(f.query, analyticsHash).get(time);
    const searchInput = { query: "", tagSlugs: ["a"], weaponGameIds: [], order: "popular" as const, limit: 48, offset: 0 };
    const filtered = await f.repository.searchPublishedPresets(searchInput);
    assert.deepEqual(filtered.items.map((p) => p.id), ranked.items.map((p) => p.id));
    assert.notDeepEqual(applyLaunchPlacement(ranked.items, time).map((p) => p.id), ranked.items.map((p) => p.id));
    const least = ranked.items.at(-1)!.id;
    f.db.prepare("UPDATE preset_search_documents SET title = CASE WHEN preset_id = ? THEN 'Needle' ELSE 'Other' END, description = 'Needle'").run(least);
    const relevant = await f.repository.searchPublishedPresets({ ...searchInput, query: "Needle", tagSlugs: [] });
    assert.equal(relevant.items[0].id, least);
    f.db.prepare("UPDATE presets SET updated_at = ? WHERE id = ?").run(time + 1000, least);
    const updated = await f.repository.listDashboardPresets("updated", undefined, 48, 0);
    assert.equal(updated.items[0].id, least);
  } finally { f.db.close(); }
});

test("restoring a day's leader restores comparisons and hidden leaders retain their historical cohort", async () => {
  const f = fixture();
  try {
    f.add(); f.add("leader");
    f.addEvent("a"); f.addEvent("b");
    for (let i = 0; i < 13; i++) f.addEvent(`reader-${i}`, now, { presetId: "leader" });
    f.db.exec("INSERT INTO preset_statistics (preset_id, views_total, copies_total) VALUES ('p', 20, 10)");
    const baseline = (await f.store.get(now)).items.find((p) => p.id === "p")!.surge;
    f.db.exec("UPDATE presets SET status = 'hidden' WHERE id = 'leader'");
    assert.equal((await f.store.get(now)).items[0].surge, baseline);
    f.db.exec("UPDATE preset_events SET is_invalidated = 1 WHERE preset_id = 'leader'");
    assert.ok((await f.store.get(now)).items[0].surge > baseline);
    f.db.exec("UPDATE preset_events SET is_invalidated = 0 WHERE preset_id = 'leader'");
    assert.equal((await f.store.get(now)).items[0].surge, baseline);
    const counters = f.db.prepare("SELECT views_total, copies_total FROM preset_statistics WHERE preset_id = 'p'").get();
    assert.equal(counters?.views_total, 20);
    assert.equal(counters?.copies_total, 10);
  } finally { f.db.close(); }
});

test("deployment builds, migrates, recalculates and only then uploads, and SQL binding is escaped", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.version, "1.2.1");
  assert.match(pkg.scripts.deploy, /worker:build && wrangler d1 migrations apply DB --remote && tsx scripts\/preset-stats.ts remote refresh-ranking && wrangler deploy/);
  assert.equal(bindRankingSql("SELECT ?, ?, ?", ["a'?", 2, null]), "SELECT 'a''?', 2, NULL");
  assert.throws(() => bindRankingSql("SELECT ?", []), /Missing/);
  assert.throws(() => bindRankingSql("SELECT 1", [1]), /Unused/);
});
