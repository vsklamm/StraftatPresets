import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { createDatabase } from "../db";
import { D1Repository } from "../src/infrastructure/d1-repository";
import { getPublishedPresetPreview, listPublishedPresetUrls } from "../src/infrastructure/d1-published-preset-preview";
import { PresetLimitReachedError } from "../src/domain/preset-policy";
import { prepareThumbnail } from "../src/lib/image-moderation";
import { MAX_THUMBNAIL_UPLOAD_BYTES } from "../src/domain/thumbnail-policy";
import { MAX_PRESET_TAGS } from "../src/domain/tag-policy";
import { env } from "../src/env";

type QueryResult<Row> = { results: Row[] };

function runD1(stateDirectory: string, args: string[]) {
  const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
  return execFileSync(process.execPath, [wrangler, "d1", ...args, "--local", "--persist-to", stateDirectory], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, CI: "true", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
  });
}

function queryD1<Row>(stateDirectory: string, sql: string): QueryResult<Row> {
  return JSON.parse(runD1(stateDirectory, ["execute", "DB", "--command", sql, "--json"]))[0] as QueryResult<Row>;
}

async function withLocalRepository(run: (repository: D1Repository, binding: D1Database) => Promise<void>) {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), "straftat-presets-repository-"));
  let platform: PlatformProxy<{ DB: D1Database }> | undefined;
  try {
    runD1(stateDirectory, ["migrations", "apply", "DB"]);
    const { compatibility_date, d1_databases } = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
    const configPath = path.join(stateDirectory, "wrangler.json");
    writeFileSync(configPath, JSON.stringify({ name: "preset-repository-test", compatibility_date, d1_databases }));
    platform = await getPlatformProxy<{ DB: D1Database }>({
      configPath, envFiles: [], remoteBindings: false, persist: { path: path.join(stateDirectory, "v3") },
    });
    await run(new D1Repository(createDatabase(platform.env.DB)), platform.env.DB);
  } finally {
    await platform?.dispose();
    rmSync(stateDirectory, { recursive: true, force: true });
  }
}

test("short public slugs preserve aliases and disappear on retraction or deletion", async () => {
  await withLocalRepository(async (repository, binding) => {
    await binding.prepare("INSERT INTO tags (slug, label) VALUES ('practice', 'Practice'), ('duel', 'Duel')").run();
    async function publish(title: string, author: string) {
      const draft = await repository.createPresetDraft(author, title);
      const content = { ...draft.content, description: "Selected arenas for practicing movement and close-range duels.", tags: ["practice", "duel"], versions: [{
        ...draft.content.versions[0], mapPlaylists: [{ name: "Arena", description: "", encodedValue: "code", mapNames: ["Arena_00"] }],
      }] };
      await binding.prepare("UPDATE preset_revisions SET content_json = ?, status = 'pending' WHERE id = ?")
        .bind(JSON.stringify(content), draft.revisionId).run();
      const result = await repository.reviewPreset({ presetId: draft.id, revisionId: draft.revisionId, reviewerId: null, decision: "approve", issues: [] });
      assert.equal(result.result, "updated", JSON.stringify(result));
      if (result.result !== "updated") assert.fail("Valid preset must publish");
      return { draft, preset: result.preset };
    }
    const first = await publish("Practice Arena", "author-1");
    assert.equal(first.preset.slug, "practice-arena");
    for (const identifier of [first.draft.slug, first.preset.slug, first.preset.id]) {
      assert.equal((await getPublishedPresetPreview(binding, identifier))?.id, first.preset.id);
      assert.equal((await repository.getPresetForViewer(identifier))?.slug, "practice-arena");
    }
    const occurredAt = new Date();
    const day = occurredAt.toISOString().slice(0, 10);
    const interaction = { kind: "link_open" as const, actorHash: "visitor", isAuthenticated: false,
      clientEventId: crypto.randomUUID(), dedupeBucket: day, dayBucket: day, occurredAt };
    assert.equal((await repository.recordPresetEvent({ ...interaction, presetId: first.draft.slug })).result, "counted");
    assert.equal((await repository.recordPresetEvent({ ...interaction, clientEventId: crypto.randomUUID(), presetId: first.preset.slug })).result, "duplicate");
    const duplicate = await publish("Practice Arena", "author-2");
    assert.equal(duplicate.preset.slug, `practice-arena-${duplicate.preset.id.replaceAll("-", "").slice(0, 7)}`);
    const revised = await repository.savePresetDraft({ presetId: first.preset.id, userId: "author-1", revisionId: first.preset.revisionId,
      editVersion: first.preset.editVersion, content: { ...first.preset.content, title: "Private changes" } });
    assert.equal(revised.result, "updated");
    assert.equal((await getPublishedPresetPreview(binding, first.draft.slug))?.title, "Practice Arena");
    assert.equal((await repository.retractPreset({ identifier: first.draft.slug })).result, "retracted");
    for (const identifier of [first.draft.slug, first.preset.slug, first.preset.id]) {
      assert.equal(await getPublishedPresetPreview(binding, identifier), undefined);
      assert.equal(await repository.getPresetForViewer(identifier), undefined);
    }
    assert.ok(await repository.getPresetForViewer(first.preset.id, "author-1"));
    assert.equal((await repository.recordPresetEvent({ ...interaction, clientEventId: crypto.randomUUID(), presetId: first.draft.slug })).result, "not_found");
    assert.deepEqual((await listPublishedPresetUrls(binding)).map(p => p.slug), [duplicate.preset.slug]);
    const retracted = await repository.getPresetForViewer(first.preset.id, "author-1");
    await binding.prepare("UPDATE preset_revisions SET status='pending' WHERE id=?").bind(retracted!.revisionId).run();
    const republished = await repository.reviewPreset({ presetId: first.preset.id, revisionId: retracted!.revisionId, reviewerId: null, decision: "approve", issues: [] });
    assert.equal(republished.result, "updated");
    if (republished.result !== "updated") assert.fail("A retracted preset must be publishable again");
    assert.equal(republished.preset.slug, "practice-arena");
    assert.equal((await getPublishedPresetPreview(binding, first.draft.slug))?.title, "Private changes");
    assert.deepEqual(await repository.deletePreset(first.preset.id, "author-1"), { result: "deleted" });
    const claims = await binding.prepare("SELECT slug, preset_id FROM preset_slugs WHERE slug IN (?, ?)")
      .bind(first.draft.slug, first.preset.slug).all();
    assert.equal(claims.results.length, 2);
    assert.ok(claims.results.every(row => row.preset_id === null));
    const replacement = await publish("Practice Arena", "author-3");
    assert.notEqual(replacement.preset.slug, "practice-arena");
    assert.equal(await getPublishedPresetPreview(binding, "practice-arena"), undefined);
    await assert.rejects(binding.prepare("UPDATE presets SET slug = 'practice-arena' WHERE id = ?").bind(replacement.preset.id).run(), /preset slug unavailable/);
  });
});

test("large publications reserve their public slug only in the final atomic batch", async () => {
  await withLocalRepository(async (repository, binding) => {
    await binding.prepare("INSERT INTO tags (slug,label) VALUES ('practice','Practice'),('duel','Duel')").run();
    const draft = await repository.createPresetDraft("author-1", "Large Arena");
    const content = { ...draft.content, description: "Selected arenas for practicing movement and close-range duels.", tags: ["practice", "duel"], versioningEnabled: true,
      versions: Array.from({ length: 10 }, (_, index) => ({ label: `v1.0.${9 - index}`, weaponConfigurations: [],
        mapPlaylists: Array.from({ length: 7 }, (_, playlist) => ({ name: `Arena ${playlist}`, description: "", encodedValue: "code", mapNames: ["Arena_00"] })),
      })),
    };
    await binding.prepare("UPDATE preset_revisions SET content_json=?, status='pending' WHERE id=?").bind(JSON.stringify(content), draft.revisionId).run();
    await binding.prepare("CREATE TRIGGER fixture_publication_failure BEFORE UPDATE OF status ON preset_revisions WHEN NEW.status='published' BEGIN SELECT RAISE(ABORT,'fixture publication failure'); END").run();
    const approve = () => repository.reviewPreset({ presetId: draft.id, revisionId: draft.revisionId, reviewerId: null, decision: "approve", issues: [] });
    const failed = await approve();
    assert.deepEqual(failed, { result: "conflict" }, JSON.stringify(failed));
    assert.equal(await getPublishedPresetPreview(binding, "large-arena"), undefined);
    assert.equal(await binding.prepare("SELECT count(*) AS count FROM preset_slugs WHERE preset_id=?").bind(draft.id).first("count"), 0);
    assert.equal(await binding.prepare("SELECT status FROM preset_revisions WHERE id=?").bind(draft.revisionId).first("status"), "pending");
    await binding.prepare("DROP TRIGGER fixture_publication_failure").run();
    const result = await approve();
    assert.equal(result.result, "updated");
    assert.equal((await getPublishedPresetPreview(binding, "large-arena"))?.id, draft.id);
    assert.deepEqual(await approve(), { result: "not_found" });
  });
});

test("retiring Prop Hunt hides it and rejects assignments without affecting other tags", async () => {
  await withLocalRepository(async (repository, binding) => {
    await binding.prepare("INSERT INTO tags (slug, label) VALUES ('prop-hunt', 'Prop Hunt'), ('custom-tag', 'Custom Tag')").run();
    await binding.prepare(readFileSync("db/init/0005_retire_prop_hunt.sql", "utf8")).run();

    assert.deepEqual(await repository.listActiveTags(), [{ slug: "custom-tag", label: "Custom Tag" }]);
    await assert.rejects(repository.replacePresetTags("unused-preset", ["prop-hunt"]), /Unknown or inactive tags: prop-hunt/);
    await binding.prepare(readFileSync("db/init/0005_retire_prop_hunt.sql", "utf8")).run();
    assert.deepEqual(await repository.listActiveTags(), [{ slug: "custom-tag", label: "Custom Tag" }]);
  });
});

test("the initializer creates the application tables in D1", () => {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), "straftat-presets-d1-"));
  try {
    runD1(stateDirectory, ["migrations", "apply", "DB"]);
    const tables = queryD1<{ name: string }>(stateDirectory, "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name");
    const tableNames = tables.results.map((row) => row.name);
    for (const table of ["presets", "preset_revisions", "preset_versions", "map_playlists", "weapon_configurations", "preset_events", "preset_unique_actors", "preset_statistics", "preset_abuse_signals", "tags", "preset_tags", "preset_search_documents", "preset_search_terms", "preset_search_fts", "game_releases", "game_maps", "game_weapons"]) assert.ok(tableNames.includes(table));
    assert.equal(tableNames.includes("map_playlist_maps"), false);
    assert.equal(tableNames.includes("randomized_weapons"), false);
    assert.equal(tableNames.includes("likes"), false);
    assert.equal(tableNames.includes("preset_like_events"), false);
    assert.equal(tableNames.includes("game_weapon_aliases"), false);

    const userColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(users)");
    assert.equal(userColumns.results.some((column) => column.name === "image_url"), false);
    assert.equal(userColumns.results.some((column) => column.name === "is_active"), true);
    assert.equal(userColumns.results.some((column) => column.name === "last_login_at"), true);
    assert.equal(userColumns.results.some((column) => column.name === "role"), true);
    assert.equal(userColumns.results.some((column) => column.name === "display_name"), true);
    assert.equal(userColumns.results.some((column) => column.name === "display_name_configured_at"), true);
    assert.equal(userColumns.results.some((column) => column.name === "preset_limit"), true);
    const revisionColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(preset_revisions)");
    for (const column of ["telegram_chat_id", "telegram_message_id", "telegram_message_kind", "telegram_message_html", "telegram_decision", "telegram_resolved_at"]) {
      assert.equal(revisionColumns.results.some((entry) => entry.name === column), true);
    }
    const eventColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(preset_events)");
    assert.equal(eventColumns.results.some((column) => column.name === "preset_version_id"), false);
    assert.equal(eventColumns.results.some((column) => column.name === "target_key"), true);
    const uniqueActorColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(preset_unique_actors)");
    assert.equal(uniqueActorColumns.results.some((column) => column.name === "last_seen_at"), false);
    assert.equal(uniqueActorColumns.results.some((column) => column.name === "event_count"), false);
    const statisticsColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(preset_statistics)");
    assert.equal(statisticsColumns.results.some((column) => column.name === "likes_count"), false);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO users (id, name) VALUES ('user-1', 'Tester'); INSERT INTO presets (id, slug, author_id, title) VALUES ('preset-1', 'preset-1', 'user-1', 'Preset')"]);
    assert.deepEqual(queryD1<{ visible_name: string }>(stateDirectory, "SELECT coalesce(display_name, name) AS visible_name FROM users WHERE id = 'user-1'").results, [{ visible_name: "Tester" }]);
    runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE users SET display_name = 'Example Host' WHERE id = 'user-1'"]);
    assert.deepEqual(queryD1<{ visible_name: string }>(stateDirectory, "SELECT coalesce(display_name, name) AS visible_name FROM users WHERE id = 'user-1'").results, [{ visible_name: "Example Host" }]);
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", `UPDATE users SET display_name = '${"A".repeat(401)}' WHERE id = 'user-1'`]),
      /invalid display name storage length/,
    );
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_events (id, preset_id, kind, actor_hash, client_event_id, target_key, dedupe_bucket) VALUES ('copy-1', 'preset-1', 'copy', 'actor', 'event-1', 'target-a', '2026-08-22'); INSERT INTO preset_events (id, preset_id, kind, actor_hash, client_event_id, target_key, dedupe_bucket) VALUES ('copy-2', 'preset-1', 'copy', 'actor', 'event-2', 'target-b', '2026-08-22')"]);
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_events (id, preset_id, kind, actor_hash, client_event_id, target_key, dedupe_bucket) VALUES ('copy-3', 'preset-1', 'copy', 'actor', 'event-3', 'target-a', '2026-08-22')"]),
      /UNIQUE constraint failed/,
    );
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_versions (id, preset_id, label) VALUES ('version-1', 'preset-1', 'v1'); INSERT INTO weapon_configurations (id, preset_version_id, kind, name) VALUES ('weapons-1', 'version-1', 'randomized', 'Weapons'); INSERT INTO game_weapons (name, game_id, image_path, is_active) VALUES ('Retired Weapon', 'RetiredWeapon', '/weapons/retired.webp', 0); INSERT INTO game_maps (name, kind, family, is_active) VALUES ('Retired_Map', 'core', 'Retired', 0); INSERT INTO map_playlists (id, preset_version_id, name, encoded_value, decoded_map_count) VALUES ('maps-1', 'version-1', 'Maps', 'code', 1)"]);
    for (let position = 0; position <= MAX_PRESET_TAGS; position++) {
      runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO tags (slug, label, sort_order) VALUES ('tag-${position}', 'Tag ${position}', ${position})`]);
    }
    for (let position = 0; position < MAX_PRESET_TAGS; position++) {
      runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO preset_tags (preset_id, tag_slug, position) VALUES ('preset-1', 'tag-${position}', ${position})`]);
    }
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO preset_tags (preset_id, tag_slug, position) VALUES ('preset-1', 'tag-${MAX_PRESET_TAGS}', ${MAX_PRESET_TAGS})`]),
      /at most 8 tags/,
    );
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES ('revision-1', 'preset-1', 1, 'pending', '{}', 'hash'); UPDATE preset_revisions SET status = 'published' WHERE id = 'revision-1'; UPDATE presets SET published_revision_id = 'revision-1', status = 'published' WHERE id = 'preset-1'"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_search_documents (preset_id, published_revision_id, schema_version, title, author, description, secondary_text) SELECT 'preset-1', 'revision-1', 1, 'Example Arena Setup', 'Tester', 'Explosives and traps', 'Carefully picked maps' WHERE EXISTS (SELECT 1 FROM presets WHERE id = 'preset-1' AND status = 'published' AND published_revision_id = 'revision-1') ON CONFLICT(preset_id) DO UPDATE SET published_revision_id = excluded.published_revision_id, schema_version = excluded.schema_version, title = excluded.title, author = excluded.author, description = excluded.description, secondary_text = excluded.secondary_text; DELETE FROM preset_search_terms WHERE preset_id = 'preset-1' AND EXISTS (SELECT 1 FROM preset_search_documents WHERE preset_id = 'preset-1' AND published_revision_id = 'revision-1'); INSERT INTO preset_search_terms (preset_id, published_revision_id, field, value) SELECT 'preset-1', 'revision-1', 'randomized_weapon', 'Claymore' WHERE EXISTS (SELECT 1 FROM preset_search_documents WHERE preset_id = 'preset-1' AND published_revision_id = 'revision-1')"]);
    const ftsMatch = queryD1<{ preset_id: string }>(stateDirectory, "SELECT preset_id FROM preset_search_fts WHERE preset_search_fts MATCH 'title : (\"example\"* AND \"arena\"* AND \"setup\"*)'");
    assert.deepEqual(ftsMatch.results, [{ preset_id: "preset-1" }]);
    const visibleSearch = "SELECT p.id FROM presets p INNER JOIN preset_search_documents d ON d.preset_id = p.id INNER JOIN preset_search_fts f ON f.preset_id = p.id WHERE p.status = 'published' AND p.published_revision_id IS NOT NULL AND d.schema_version = 1 AND d.published_revision_id = p.published_revision_id AND preset_search_fts MATCH 'title : setup'";
    assert.deepEqual(queryD1<{ id: string }>(stateDirectory, visibleSearch).results, [{ id: "preset-1" }]);
    runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE presets SET status = 'draft', published_revision_id = NULL WHERE id = 'preset-1'"]);
    assert.deepEqual(queryD1<{ id: string }>(stateDirectory, visibleSearch).results, []);
    assert.deepEqual(queryD1<{ preset_id: string }>(stateDirectory, "SELECT preset_id FROM preset_search_fts").results, [{ preset_id: "preset-1" }]);
    runD1(stateDirectory, ["execute", "DB", "--command", "DELETE FROM preset_search_documents WHERE preset_id = 'preset-1'"]);
    assert.deepEqual(queryD1<{ preset_id: string }>(stateDirectory, "SELECT preset_id FROM preset_search_fts").results, []);
    assert.deepEqual(queryD1<{ preset_id: string }>(stateDirectory, "SELECT preset_id FROM preset_search_terms").results, []);
    const removedIndexes = ["idx_preset_events_ranking", "idx_preset_unique_actors_counts", "idx_preset_statistics_ranking"];
    const indexes = queryD1<{ name: string }>(stateDirectory, "SELECT name FROM sqlite_schema WHERE type = 'index'").results.map((row) => row.name);
    for (const indexName of removedIndexes) assert.equal(indexes.includes(indexName), false);
    const removedTriggers = queryD1<{ name: string }>(stateDirectory, "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE '%_touch_ranking_%'");
    assert.deepEqual(removedTriggers.results, []);
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("preset revision constraints preserve immutable submitted snapshots", () => {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), "straftat-presets-revisions-"));
  try {
    runD1(stateDirectory, ["migrations", "apply", "DB"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO users (id, name) VALUES ('author', 'Author'); INSERT INTO presets (id, slug, author_id, title) VALUES ('preset', 'preset', 'author', 'Preset'); INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES ('draft-1', 'preset', 1, 'draft', '{}', 'hash')"]);
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE preset_revisions SET status = 'published' WHERE id = 'draft-1'"]),
      /invalid preset revision transition/,
    );
    runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE preset_revisions SET status = 'pending' WHERE id = 'draft-1'; UPDATE presets SET working_revision_id = 'draft-1' WHERE id = 'preset'"]);
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE preset_revisions SET content_json = '{\"changed\":true}' WHERE id = 'draft-1'"]),
      /only draft revision content can be edited/,
    );
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES ('draft-2', 'preset', 2, 'draft', '{}', 'hash')"]),
      /UNIQUE constraint failed/,
    );
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("thumbnail preparation validates the source and stores only optimized WebP", async () => {
  const source = readFileSync("tests/fixtures/sample.jpg");
  const webp = readFileSync("public/weapons/ak.webp");
  const sourceArrayBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
  const prepared = await prepareThumbnail(
    { type: "image/jpeg", size: source.length, arrayBuffer: async () => sourceArrayBuffer },
    { transform: async () => new Uint8Array(webp) },
  );
  assert.equal(prepared.contentType, "image/webp");
  assert.equal(prepared.extension, "webp");
  assert.ok(prepared.width >= 320);
  assert.ok(prepared.height >= 180);
  assert.deepEqual(prepared.bytes, new Uint8Array(webp));
  assert.match(prepared.sha256, /^[a-f0-9]{64}$/);
});

test("thumbnail preparation accepts valid WebP images", async () => {
  const webp = readFileSync("public/weapons/ak.webp");
  const webpArrayBuffer = webp.buffer.slice(webp.byteOffset, webp.byteOffset + webp.byteLength) as ArrayBuffer;
  const prepared = await prepareThumbnail(
    { type: "image/webp", size: webp.length, arrayBuffer: async () => webpArrayBuffer },
    { transform: async () => new Uint8Array(webp) },
  );
  assert.equal(prepared.contentType, "image/webp");
  assert.equal(prepared.extension, "webp");
  assert.ok(prepared.width > 0);
  assert.ok(prepared.height > 0);
  assert.deepEqual(prepared.bytes, new Uint8Array(webp));
});

test("thumbnail preparation rejects a spoofed content type", async () => {
  const source = readFileSync("tests/fixtures/sample.jpg");
  const sourceArrayBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
  await assert.rejects(
    prepareThumbnail({ type: "image/png", size: source.length, arrayBuffer: async () => sourceArrayBuffer }, { transform: async () => new Uint8Array() }),
    /does not match/,
  );
});

test("thumbnail uploads are capped at two megabytes before decoding", async () => {
  await assert.rejects(
    prepareThumbnail(
      { type: "image/jpeg", size: MAX_THUMBNAIL_UPLOAD_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) },
      { transform: async () => new Uint8Array() },
    ),
    /2 MB/,
  );
});

test("author preset limit allows four presets, rejects the fifth and frees a slot after deletion", async () => {
  await withLocalRepository(async (repository, binding) => {
    const created = [];
    for (let i = 1; i <= 4; i++) created.push(await repository.createPresetDraft("author-1", `Preset ${i}`));
    await assert.rejects(repository.createPresetDraft("author-1", "Fifth preset"), PresetLimitReachedError);
    assert.equal((await repository.listDashboardPresets("mine", "author-1", 48, 0)).total, 4);

    const first = created[0];
    await binding.prepare("UPDATE preset_revisions SET status = 'pending' WHERE id = ?").bind(first.revisionId).run();
    const saved = await repository.savePresetDraft({
      presetId: first.id, userId: "author-1", revisionId: first.revisionId, editVersion: first.editVersion,
      content: { ...first.content, title: "Revised preset" },
    });
    assert.equal(saved.result, "updated");
    if (saved.result !== "updated") assert.fail("Drafting a revision must remain possible at the preset limit");
    assert.notEqual(saved.preset.revisionId, first.revisionId);
    assert.equal((await repository.listDashboardPresets("mine", "author-1", 48, 0)).total, 4);

    assert.deepEqual(await repository.deletePreset(created[3].id, "author-1"), { result: "deleted" });
    assert.equal((await repository.listDashboardPresets("mine", "author-1", 48, 0)).total, 3);
    await repository.createPresetDraft("author-1", "Replacement preset");
    assert.equal((await repository.listDashboardPresets("mine", "author-1", 48, 0)).total, 4);
  });
});

test("preset limit migration backfills existing authors and only raises the limit", () => {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), "straftat-presets-limit-upgrade-"));
  try {
    for (const migration of ["0000_initial_schema.sql", "0001_amazing_kid_colt.sql", "0002_brown_cable.sql"]) {
      runD1(stateDirectory, ["execute", "DB", "--file", path.resolve("db/init", migration)]);
    }
    runD1(stateDirectory, ["execute", "DB", "--command", [
      "INSERT INTO users (id, name) VALUES ('qualified', 'Qualified'), ('regular', 'Regular');",
      "INSERT INTO presets (id, slug, author_id, title, status, thumbnail_key) VALUES",
      "('q-1', 'q-1', 'qualified', 'Q1', 'published', 'q1.webp'),",
      "('q-2', 'q-2', 'qualified', 'Q2', 'published', 'q2.webp'),",
      "('q-3', 'q-3', 'qualified', 'Q3', 'published', 'q3.webp'),",
      "('r-1', 'r-1', 'regular', 'R1', 'published', 'r1.webp'),",
      "('r-2', 'r-2', 'regular', 'R2', 'published', 'r2.webp'),",
      "('r-3', 'r-3', 'regular', 'R3', 'published', NULL)",
    ].join(" ")]);

    runD1(stateDirectory, ["execute", "DB", "--file", path.resolve("db/init/0003_raise_preset_limit.sql")]);
    assert.deepEqual(
      queryD1<{ id: string; preset_limit: number }>(stateDirectory, "SELECT id, preset_limit FROM users ORDER BY id").results,
      [{ id: "qualified", preset_limit: 15 }, { id: "regular", preset_limit: 4 }],
    );

    runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE presets SET thumbnail_key = 'r3.webp' WHERE id = 'r-3'"]);
    assert.equal(queryD1<{ preset_limit: number }>(stateDirectory, "SELECT preset_limit FROM users WHERE id = 'regular'").results[0].preset_limit, 15);

    runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE presets SET thumbnail_key = NULL WHERE author_id IN ('qualified', 'regular')"]);
    assert.deepEqual(
      queryD1<{ id: string; preset_limit: number }>(stateDirectory, "SELECT id, preset_limit FROM users ORDER BY id").results,
      [{ id: "qualified", preset_limit: 15 }, { id: "regular", preset_limit: 15 }],
    );
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("submission enforces the preset cooldown and author hourly cap before validating incomplete drafts", async () => {
  await withLocalRepository(async (repository, binding) => {
    const now = Date.UTC(2026, 0, 1, 12);
    const draft = await repository.createPresetDraft("author-1", "Incomplete preset", new Date(now));
    const another = await repository.createPresetDraft("author-1", "Another preset", new Date(now));
    const history = (id: string, number: number, submittedAt: number, presetId = draft.id) => binding.prepare(
      "INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash, submitted_at) VALUES (?, ?, ?, 'archived', ?, 'hash', ?)",
    ).bind(id, presetId, number, JSON.stringify(draft.content), submittedAt);
    await binding.batch([history("old", 2, now - 7_200_000), history("recent", 3, now - 10_000)]);
    const submit = (time: number) => repository.submitPreset({
      presetId: draft.id, userId: "author-1", revisionId: draft.revisionId, editVersion: draft.editVersion, now: new Date(time),
    });

    const cooldown = await submit(now);
    assert.equal(cooldown.result, "rate_limited");
    if (cooldown.result !== "rate_limited") assert.fail("A recent submission must start a cooldown");
    assert.equal(cooldown.retryAfterSeconds, 10);
    const justBefore = await submit(now + 9_999);
    assert.equal(justBefore.result, "rate_limited");
    if (justBefore.result !== "rate_limited") assert.fail("The cooldown must last the full twenty seconds");
    assert.equal(justBefore.retryAfterSeconds, 1);
    assert.equal((await submit(now + 10_000)).result, "invalid");

    await binding.batch(Array.from({ length: 7 }, (_, i) => history(`hourly-${i}`, i + 4, now - 30_000, another.id)));
    const hourly = await submit(now + 10_000);
    assert.equal(hourly.result, "rate_limited");
    if (hourly.result !== "rate_limited") assert.fail("Eight submissions in an hour must reach the author cap");
    assert.match(hourly.message, /8 submissions per hour/);
    assert.equal(hourly.retryAfterSeconds, undefined);
    const afterHourlyHistoryExpires = now + 60 * 60 * 1000 - 30_000 + 1;
    assert.equal((await submit(afterHourlyHistoryExpires)).result, "invalid");
  });
});

test("updated dashboard sorts by published revision updates rather than creation or preset timestamps", async () => {
  await withLocalRepository(async (repository, binding) => {
    const now = Date.UTC(2026, 0, 1, 12);
    const older = now - 100_000;
    const newer = now - 10_000;
    const a = await repository.createPresetDraft("author-1", "Preset A", new Date(older));
    const b = await repository.createPresetDraft("author-1", "Preset B", new Date(older + 50_000));
    for (const [preset, publishedAt, updatedAt] of [[a, older, newer], [b, older + 50_000, older + 50_000]] as const) {
      await binding.batch([
        binding.prepare("UPDATE preset_revisions SET status = 'pending' WHERE id = ?").bind(preset.revisionId),
        binding.prepare("UPDATE preset_revisions SET status = 'published', updated_at = ? WHERE id = ?").bind(updatedAt, preset.revisionId),
        binding.prepare("UPDATE presets SET status = 'published', published_revision_id = ?, working_revision_id = NULL, published_at = ?, updated_at = ? WHERE id = ?")
          .bind(preset.revisionId, publishedAt, preset.id === b.id ? now : older, preset.id),
      ]);
    }
    const sorted = await repository.listDashboardPresets("updated", undefined, 48, 0);
    assert.equal(sorted.total, 2);
    assert.deepEqual(sorted.items.map((preset) => preset.id), [a.id, b.id]);
  });
});

test("retraction removes the published preset and blocks submissions for seven days", async () => {
  await withLocalRepository(async (repository, binding) => {
    const now = Date.UTC(2026, 0, 1, 12);
    const weekLater = now + 7 * 24 * 60 * 60 * 1000;
    const preset = await repository.createPresetDraft("author-1", "Published preset", new Date(now));
    await binding.batch([
      binding.prepare("UPDATE preset_revisions SET status = 'pending' WHERE id = ?").bind(preset.revisionId),
      binding.prepare("UPDATE preset_revisions SET status = 'published' WHERE id = ?").bind(preset.revisionId),
      binding.prepare("UPDATE presets SET status = 'published', published_revision_id = ?, working_revision_id = NULL, published_at = ? WHERE id = ?")
        .bind(preset.revisionId, now, preset.id),
    ]);
    const published = await binding.prepare("SELECT content_json, content_hash FROM preset_revisions WHERE id = ?").bind(preset.revisionId).first();
    await binding.prepare("INSERT INTO preset_search_documents (preset_id, published_revision_id, schema_version, title, author, description, secondary_text) VALUES (?, ?, 1, 'Published preset', 'Creator', '', '')")
      .bind(preset.id, preset.revisionId).run();

    const result = await repository.retractPreset({ identifier: `https://straftatpresets.com/p/${preset.slug}`, reason: "Invalid content", now: new Date(now) });
    assert.equal(result.result, "retracted");
    if (result.result !== "retracted") assert.fail("A published preset must be retractable");
    assert.equal(result.preset.canEdit, true);
    assert.equal(result.preset.workingStatus, "rejected");
    assert.equal(result.preset.hasPublishedRevision, false);
    assert.notEqual(result.preset.revisionId, preset.revisionId);
    assert.equal(result.preset.revisionNumber, 2);
    assert.deepEqual(result.preset.content, preset.content);
    assert.ok(result.preset.issues.some((issue) => issue.code === "retracted"));
    assert.deepEqual(await binding.prepare("SELECT status, content_json, content_hash FROM preset_revisions WHERE id = ?").bind(preset.revisionId).first(), { ...published, status: "archived" });
    const updated = await binding.prepare("SELECT status, published_revision_id, resubmission_blocked_until, retracted_reason FROM presets WHERE id = ?").bind(preset.id).first();
    assert.deepEqual(updated, { status: "draft", published_revision_id: null, resubmission_blocked_until: weekLater, retracted_reason: "Invalid content" });
    assert.equal(await binding.prepare("SELECT suspended_until FROM users WHERE id = 'author-1'").first("suspended_until"), weekLater);
    assert.equal(await repository.getPresetForViewer(preset.id), undefined);
    assert.equal((await repository.listDashboardPresets("updated", undefined, 48, 0)).total, 0);
    assert.equal(await binding.prepare("SELECT count(*) AS count FROM preset_search_documents WHERE preset_id = ?").bind(preset.id).first("count"), 0);

    const draft = await repository.savePresetDraft({
      presetId: preset.id, userId: "author-1", revisionId: result.preset.revisionId, editVersion: result.preset.editVersion,
      content: { ...preset.content, title: "Revised preset" }, now: new Date(now + 1_000),
    });
    assert.equal(draft.result, "updated");
    if (draft.result !== "updated") assert.fail("The creator must be able to edit a retracted preset");
    assert.equal(draft.preset.slug, preset.slug);
    const submit = (time: number) => repository.submitPreset({
      presetId: preset.id, userId: "author-1", revisionId: draft.preset.revisionId, editVersion: draft.preset.editVersion, now: new Date(time),
    });
    assert.equal((await submit(now + 1_000)).result, "rate_limited");
    assert.equal((await submit(weekLater)).result, "invalid");
    assert.deepEqual(await repository.retractPreset({ identifier: preset.id }), { result: "not_published" });
    assert.deepEqual(await repository.retractPreset({ identifier: "missing" }), { result: "not_found" });
  });
});

test("retraction preserves existing edits and invalidates pending Telegram reviews", async (t) => {
  const tokenDescriptor = Object.getOwnPropertyDescriptor(env, "TELEGRAM_BOT_TOKEN");
  Object.defineProperty(env, "TELEGRAM_BOT_TOKEN", { configurable: true, writable: true, value: "fixture-token" });
  t.after(() => {
    if (tokenDescriptor) Object.defineProperty(env, "TELEGRAM_BOT_TOKEN", tokenDescriptor);
    else Reflect.deleteProperty(env, "TELEGRAM_BOT_TOKEN");
  });
  const deletedMessages: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(new URL(String(input)).pathname.endsWith("/deleteMessage"), true);
    deletedMessages.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: true });
  });
  for (const status of ["draft", "pending", "rejected"] as const) {
    await t.test(status, async () => {
      await withLocalRepository(async (repository, binding) => {
        const now = new Date("2026-01-01T12:00:00Z");
        const preset = await repository.createPresetDraft("author-1", "Published preset", now);
        await binding.batch([
          binding.prepare("UPDATE preset_revisions SET status = 'pending' WHERE id = ?").bind(preset.revisionId),
          binding.prepare("UPDATE preset_revisions SET status = 'published' WHERE id = ?").bind(preset.revisionId),
          binding.prepare("UPDATE presets SET status = 'published', published_revision_id = ?, working_revision_id = NULL, published_at = ? WHERE id = ?")
            .bind(preset.revisionId, now.getTime(), preset.id),
        ]);
        const saved = await repository.savePresetDraft({
          presetId: preset.id, userId: "author-1", revisionId: preset.revisionId, editVersion: preset.editVersion,
          content: { ...preset.content, title: "Unpublished edits" }, now,
        });
        assert.equal(saved.result, "updated");
        if (saved.result !== "updated") assert.fail("The published preset must support a working revision");
        const revisionId = saved.preset.revisionId;
        if (status !== "draft") await binding.prepare("UPDATE preset_revisions SET status = 'pending' WHERE id = ?").bind(revisionId).run();
        if (status === "rejected") await binding.prepare("UPDATE preset_revisions SET status = 'rejected' WHERE id = ?").bind(revisionId).run();
        if (status === "pending") {
          await binding.prepare("UPDATE preset_revisions SET telegram_chat_id = 'fixture-chat', telegram_message_id = 42, telegram_message_kind = 'text', telegram_message_html = 'Pending review' WHERE id = ?")
            .bind(revisionId).run();
        }

        const result = await repository.retractPreset({ identifier: preset.slug, now });
        assert.equal(result.result, "retracted");
        if (result.result !== "retracted") assert.fail("Retraction must preserve the working revision");
        assert.equal(result.preset.revisionId, revisionId);
        assert.deepEqual(result.preset.content, saved.preset.content);
        assert.equal(result.preset.workingStatus, status === "draft" ? "draft" : "rejected");
        assert.ok(result.preset.issues.some((issue) => issue.code === "retracted"));
        assert.equal(await binding.prepare("SELECT revision_counter FROM presets WHERE id = ?").bind(preset.id).first("revision_counter"), 2);
        assert.equal(await binding.prepare("SELECT status FROM preset_revisions WHERE id = ?").bind(preset.revisionId).first("status"), "archived");
        assert.equal(await repository.getPresetForViewer(preset.id), undefined);
        if (status === "pending") {
          assert.deepEqual(deletedMessages, [{ chat_id: "fixture-chat", message_id: 42 }]);
          assert.equal((await repository.getRevisionModerationContext(revisionId))?.message, undefined);
          assert.deepEqual(await repository.reviewPreset({ presetId: preset.id, revisionId, reviewerId: null, decision: "approve", issues: [], now }), { result: "conflict" });
        }
      });
    });
  }
});

test("retraction rolls back every database change if its batch fails", async () => {
  await withLocalRepository(async (repository, binding) => {
    const now = new Date("2026-01-01T12:00:00Z");
    const preset = await repository.createPresetDraft("author-1", "Published preset", now);
    await binding.batch([
      binding.prepare("UPDATE preset_revisions SET status = 'pending' WHERE id = ?").bind(preset.revisionId),
      binding.prepare("UPDATE preset_revisions SET status = 'published' WHERE id = ?").bind(preset.revisionId),
      binding.prepare("UPDATE presets SET status = 'published', published_revision_id = ?, working_revision_id = NULL, published_at = ? WHERE id = ?")
        .bind(preset.revisionId, now.getTime(), preset.id),
      binding.prepare("INSERT INTO preset_search_documents (preset_id, published_revision_id, schema_version, title, author, description, secondary_text) VALUES (?, ?, 1, 'Published preset', 'Creator', '', '')")
        .bind(preset.id, preset.revisionId),
    ]);
    await binding.exec("CREATE TRIGGER fail_test_suspension BEFORE UPDATE OF suspended_until ON users BEGIN SELECT RAISE(ABORT, 'fixture suspension failure'); END;");

    await assert.rejects(repository.retractPreset({ identifier: preset.id, now }), /fixture suspension failure/);
    assert.equal((await repository.getPresetForViewer(preset.id))?.revisionId, preset.revisionId);
    assert.equal(await binding.prepare("SELECT status FROM preset_revisions WHERE id = ?").bind(preset.revisionId).first("status"), "published");
    assert.equal(await binding.prepare("SELECT count(*) AS count FROM preset_search_documents WHERE preset_id = ?").bind(preset.id).first("count"), 1);
    assert.deepEqual(await binding.prepare("SELECT revision_counter, working_revision_id, resubmission_blocked_until, retracted_at FROM presets WHERE id = ?").bind(preset.id).first(), {
      revision_counter: 1, working_revision_id: null, resubmission_blocked_until: null, retracted_at: null,
    });
    assert.equal(await binding.prepare("SELECT suspended_until FROM users WHERE id = 'author-1'").first("suspended_until"), null);
  });
});
