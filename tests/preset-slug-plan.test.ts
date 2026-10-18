import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { planPresetSlugs, type PresetSlugSource } from "../src/domain/preset-slug-plan";
import { presetSlugBackfillSql } from "../src/infrastructure/preset-slug-backfill";
import { getPublishedPresetPreview, listPublishedPresetUrls } from "../src/infrastructure/d1-published-preset-preview";

const migrations = readdirSync("db/init").filter(file => file.endsWith(".sql")).sort();
function fixture(upgrade = false) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of upgrade ? migrations.slice(0, -1) : migrations) db.exec(readFileSync(`db/init/${file}`, "utf8"));
  db.exec("INSERT INTO users(id, name) VALUES ('author', 'Creator')");
  const add = (id: string, title: string, slug = `old-${id}`) => {
    db.prepare("INSERT INTO presets(id, slug, author_id, title, created_at, updated_at) VALUES (?, ?, 'author', ?, 1000, 2000)").run(id, slug, title);
    db.prepare("INSERT INTO preset_revisions(id, preset_id, revision_number, status, content_json, content_hash) VALUES (?, ?, 1, 'published', ?, 'hash')")
      .run(`r-${id}`, id, JSON.stringify({ title }));
    db.prepare("UPDATE presets SET status='published', published_revision_id=?, first_published_at=1000, published_at=1000 WHERE id=?").run(`r-${id}`, id);
  };
  const rows = () => db.prepare(`SELECT p.id,p.slug,p.status,p.published_revision_id AS revisionId,
    json_extract(r.content_json,'$.title') AS title FROM presets p LEFT JOIN preset_revisions r ON r.id=p.published_revision_id ORDER BY p.id`).all() as PresetSlugSource[];
  const claims = () => db.prepare("SELECT slug,preset_id AS presetId FROM preset_slugs").all() as {slug:string;presetId:string|null}[];
  const apply = (plan: ReturnType<typeof planPresetSlugs>) => {
    const compiled = new SQLiteSyncDialect().sqlToQuery(presetSlugBackfillSql(plan));
    return db.prepare(compiled.sql).all(...compiled.params as (string|number|null)[]);
  };
  const binding = { prepare(statement: string) {
    const bound = (params: (string | number | null)[] = []) => ({
      bind: (...values: (string | number | null)[]) => bound(values),
      first: async () => db.prepare(statement).get(...params) ?? null,
      all: async () => ({ results: db.prepare(statement).all(...params) }),
    });
    return bound();
  } } as unknown as D1Database;
  return { db, add, rows, claims, apply, binding };
}

test("slug backfill changes only canonical slugs and keeps direct aliases, including on rerun", t => {
  const f = fixture(); t.after(() => f.db.close());
  f.add("first", "<#f00>Practice Arena");
  f.add("second", "Second Arena");
  f.db.exec("INSERT INTO preset_statistics(preset_id, views_total, copies_total, updated_at) VALUES ('first',42,11,3000)");
  f.db.exec("INSERT INTO preset_events(id,preset_id,kind,actor_hash,dedupe_bucket,created_at) VALUES ('event','first','view','visitor','1970-01-01',3000)");
  const protectedTables = ["preset_revisions", "preset_events", "preset_statistics", "preset_ranking_lottery"];
  const protectedRows = protectedTables.map(table => f.db.prepare(`SELECT * FROM ${table}`).all());
  const before = f.db.prepare("SELECT * FROM presets ORDER BY id").all();
  const plan = planPresetSlugs(f.rows(), f.claims());
  assert.deepEqual(plan.map(p => p.newSlug), ["practice-arena", "second-arena"]);
  f.apply(plan);
  assert.deepEqual(f.db.prepare("SELECT * FROM presets ORDER BY id").all().map(row => ({ ...row })), before.map((row, i) => ({ ...row, slug: plan[i].newSlug })));
  assert.deepEqual(f.claims().filter(c => c.presetId === "first").map(c => c.slug).sort(), ["old-first", "practice-arena"]);
  f.apply(plan);
  assert.equal(f.claims().length, 4);
  assert.deepEqual(protectedTables.map(table => f.db.prepare(`SELECT * FROM ${table}`).all()), protectedRows);
});

test("migration seeds existing links without changing preset rows", t => {
  const f = fixture(true); t.after(() => f.db.close());
  f.add("first", "Practice Arena");
  const before = f.db.prepare("SELECT * FROM presets").all();
  f.db.exec(readFileSync(`db/init/${migrations.at(-1)}`, "utf8"));
  assert.deepEqual(f.db.prepare("SELECT * FROM presets").all(), before);
  assert.deepEqual(f.claims().map(row => ({ ...row })), [{ slug: "old-first", presetId: "first" }]);
});

test("a stale or conflicting backfill rolls back the entire mapping and its aliases", t => {
  const f = fixture(); t.after(() => f.db.close());
  f.add("first", "Practice Arena"); f.add("second", "Second Arena");
  const plan = planPresetSlugs(f.rows(), f.claims());
  f.db.exec("UPDATE presets SET status='draft', published_revision_id=NULL WHERE id='second'");
  assert.throws(() => f.apply(plan), /NOT NULL constraint failed/);
  assert.equal(f.rows()[0].slug, "old-first");
  assert.equal(f.claims().some(row => row.slug === "practice-arena"), false);
  f.db.exec("UPDATE presets SET status='published', published_revision_id='r-second' WHERE id='second'");
  f.add("third", "New claimant", "second-arena");
  assert.throws(() => f.apply(plan), /preset slug unavailable|UNIQUE constraint failed/);
  assert.equal(f.rows()[0].slug, "old-first");
  assert.equal(f.claims().some(row => row.slug === "practice-arena"), false);
});

test("collision planning respects current IDs, hidden slugs, historical and deleted reservations", t => {
  const f = fixture(); t.after(() => f.db.close());
  f.add("first1234", "Practice Arena"); f.add("second1234", "Practice Arena");
  f.db.exec("INSERT INTO preset_slugs(slug,preset_id) VALUES ('practice-arena',NULL), ('practice-arena-first12',NULL)");
  assert.deepEqual(planPresetSlugs(f.rows(), f.claims()).map(row => row.newSlug), ["practice-arena-first123", "practice-arena-second1"]);
  assert.throws(() => f.db.exec("UPDATE preset_slugs SET preset_id='first1234' WHERE slug='practice-arena'"), /ownership is immutable/);
  assert.throws(() => f.db.exec("DELETE FROM preset_slugs WHERE slug='practice-arena'"), /cannot be deleted/);
  f.db.exec("UPDATE presets SET status='hidden' WHERE id='second1234'");
  assert.equal(planPresetSlugs(f.rows(), f.claims()).length, 1);
  assert.throws(() => f.db.exec("UPDATE presets SET slug='old-second1234' WHERE id='first1234'"), /slug unavailable|UNIQUE constraint/);
});

test("sitemap URL reads include every published preset and exclude retracted, hidden and broken publications", async t => {
  const f = fixture(); t.after(() => f.db.close());
  for (let i = 0; i < 205; i++) f.add(`preset-${i}`, `Arena ${i}`);
  assert.equal((await listPublishedPresetUrls(f.binding)).length, 205);
  assert.equal((await listPublishedPresetUrls(f.binding))[0].updatedAt, 2000);
  f.db.exec("UPDATE presets SET status='draft', published_revision_id=NULL WHERE id='preset-0'; UPDATE presets SET status='hidden' WHERE id='preset-1'");
  assert.equal((await listPublishedPresetUrls(f.binding)).length, 203);
  assert.equal(await getPublishedPresetPreview(f.binding, "old-preset-0"), undefined);
  assert.equal(await getPublishedPresetPreview(f.binding, "old-preset-1"), undefined);
  f.db.exec("UPDATE preset_revisions SET status='archived' WHERE id='r-preset-2'");
  assert.equal(await getPublishedPresetPreview(f.binding, "old-preset-2"), undefined);
  assert.equal((await listPublishedPresetUrls(f.binding)).length, 202);
});
