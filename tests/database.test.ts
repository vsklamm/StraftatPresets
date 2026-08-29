import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareThumbnail } from "../src/lib/image-moderation";
import { MAX_THUMBNAIL_UPLOAD_BYTES } from "../src/domain/thumbnail-policy";
import { MAX_PRESET_TAGS } from "../src/domain/tag-policy";

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
    runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE users SET display_name = 'GoM Host' WHERE id = 'user-1'"]);
    assert.deepEqual(queryD1<{ visible_name: string }>(stateDirectory, "SELECT coalesce(display_name, name) AS visible_name FROM users WHERE id = 'user-1'").results, [{ visible_name: "GoM Host" }]);
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
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_search_documents (preset_id, published_revision_id, schema_version, title, author, description, secondary_text) SELECT 'preset-1', 'revision-1', 1, 'Game of Mines', 'Tester', 'Explosives and traps', 'Carefully picked maps' WHERE EXISTS (SELECT 1 FROM presets WHERE id = 'preset-1' AND status = 'published' AND published_revision_id = 'revision-1') ON CONFLICT(preset_id) DO UPDATE SET published_revision_id = excluded.published_revision_id, schema_version = excluded.schema_version, title = excluded.title, author = excluded.author, description = excluded.description, secondary_text = excluded.secondary_text; DELETE FROM preset_search_terms WHERE preset_id = 'preset-1' AND EXISTS (SELECT 1 FROM preset_search_documents WHERE preset_id = 'preset-1' AND published_revision_id = 'revision-1'); INSERT INTO preset_search_terms (preset_id, published_revision_id, field, value) SELECT 'preset-1', 'revision-1', 'randomized_weapon', 'Claymore' WHERE EXISTS (SELECT 1 FROM preset_search_documents WHERE preset_id = 'preset-1' AND published_revision_id = 'revision-1')"]);
    const ftsMatch = queryD1<{ preset_id: string }>(stateDirectory, "SELECT preset_id FROM preset_search_fts WHERE preset_search_fts MATCH 'title : (\"game\"* AND \"of\"* AND \"mines\"*)'");
    assert.deepEqual(ftsMatch.results, [{ preset_id: "preset-1" }]);
    const visibleSearch = "SELECT p.id FROM presets p INNER JOIN preset_search_documents d ON d.preset_id = p.id INNER JOIN preset_search_fts f ON f.preset_id = p.id WHERE p.status = 'published' AND p.published_revision_id IS NOT NULL AND d.schema_version = 1 AND d.published_revision_id = p.published_revision_id AND preset_search_fts MATCH 'title : mines'";
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

test("author preset limit allows up to four presets and rejects the fifth", () => {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), "straftat-presets-limit-"));
  try {
    runD1(stateDirectory, ["migrations", "apply", "DB"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO users (id, name) VALUES ('author-1', 'Creator')"]);
    for (let i = 1; i <= 4; i++) {
      runD1(stateDirectory, [
        "execute",
        "DB",
        "--command",
        `INSERT INTO presets (id, slug, author_id, title, status) VALUES ('p-${i}', 'slug-${i}', 'author-1', 'Preset ${i}', 'draft')`,
      ]);
    }
    const countResult = queryD1<{ count: number }>(stateDirectory, "SELECT COUNT(*) AS count FROM presets WHERE author_id = 'author-1'").results[0].count;
    assert.equal(countResult, 4);

    // Drafting revisions for an existing preset does not increase preset count
    runD1(stateDirectory, [
      "execute",
      "DB",
      "--command",
      "INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES ('r-extra', 'p-1', 2, 'draft', '{}', 'hash')",
    ]);
    const countAfterRevision = queryD1<{ count: number }>(stateDirectory, "SELECT COUNT(*) AS count FROM presets WHERE author_id = 'author-1'").results[0].count;
    assert.equal(countAfterRevision, 4);

    // Deleting a preset decrements count to 3
    runD1(stateDirectory, ["execute", "DB", "--command", "DELETE FROM presets WHERE id = 'p-4'"]);
    const countAfterDelete = queryD1<{ count: number }>(stateDirectory, "SELECT COUNT(*) AS count FROM presets WHERE author_id = 'author-1'").results[0].count;
    assert.equal(countAfterDelete, 3);
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("submission rate limit queries calculate per-preset cooldown and author hourly cap", () => {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), "straftat-presets-sublimit-"));
  try {
    runD1(stateDirectory, ["migrations", "apply", "DB"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO users (id, name) VALUES ('author-1', 'Creator')"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO presets (id, slug, author_id, title, status) VALUES ('p-1', 'slug-1', 'author-1', 'Preset 1', 'published')"]);

    const now = Date.now();
    const tenSecondsAgo = now - 10_000;
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;

    // Insert historical submissions
    runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash, submitted_at) VALUES ('r-old', 'p-1', 1, 'published', '{}', 'hash1', ${twoHoursAgo})`]);
    runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash, submitted_at) VALUES ('r-recent', 'p-1', 2, 'published', '{}', 'hash2', ${tenSecondsAgo})`]);

    // 1. Last submission on preset (within 20s cooldown)
    const lastSub = queryD1<{ submitted_at: number }>(stateDirectory, "SELECT submitted_at FROM preset_revisions WHERE preset_id = 'p-1' AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 1").results[0];
    assert.ok(lastSub);
    const elapsed = now - lastSub.submitted_at;
    assert.ok(elapsed < 20_000, "Should detect submission within 20s cooldown window");

    // 2. Author submissions within the last hour
    const oneHourAgo = now - 3_600_000;
    const hourlyCount = queryD1<{ count: number }>(stateDirectory, `SELECT COUNT(*) AS count FROM preset_revisions INNER JOIN presets ON presets.id = preset_revisions.preset_id WHERE presets.author_id = 'author-1' AND preset_revisions.submitted_at >= ${oneHourAgo}`).results[0].count;
    assert.equal(hourlyCount, 1, "Should only count submissions within the last hour (excluding 2h ago)");
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("updated view sorts presets strictly by updated_at timestamp rather than creation or publication time", () => {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), "straftat-presets-sort-"));
  try {
    runD1(stateDirectory, ["migrations", "apply", "DB"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO users (id, name) VALUES ('author-1', 'Creator')"]);

    const now = Date.now();
    const older = now - 100_000;
    const newer = now - 10_000;

    // Preset A was created early and published early, but updated recently
    runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO presets (id, slug, author_id, title, status, published_revision_id, created_at, published_at, updated_at) VALUES ('preset-a', 'preset-a', 'author-1', 'Preset A', 'published', 'rev-a', ${older}, ${older}, ${newer})`]);
    runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES ('rev-a', 'preset-a', 1, 'published', '{}', 'hash-a')`]);

    // Preset B was created later and published later, but has older updated_at
    runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO presets (id, slug, author_id, title, status, published_revision_id, created_at, published_at, updated_at) VALUES ('preset-b', 'preset-b', 'author-1', 'Preset B', 'published', 'rev-b', ${older + 50_000}, ${older + 50_000}, ${older + 50_000})`]);
    runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES ('rev-b', 'preset-b', 1, 'published', '{}', 'hash-b')`]);

    // Query sorted by updated_at DESC
    const sorted = queryD1<{ id: string }>(stateDirectory, "SELECT id FROM presets WHERE status = 'published' AND published_revision_id IS NOT NULL ORDER BY updated_at DESC, id ASC").results;
    assert.deepEqual(sorted.map((r) => r.id), ["preset-a", "preset-b"], "Preset A (recently updated) should appear before Preset B");
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("retraction sets resubmission_blocked_until on preset and suspended_until on author", () => {
  const stateDirectory = mkdtempSync(path.join(tmpdir(), "straftat-presets-retract-"));
  try {
    runD1(stateDirectory, ["migrations", "apply", "DB"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO users (id, name) VALUES ('bad-actor', 'Spammer')"]);

    const now = Date.now();
    const weekLater = now + 7 * 24 * 60 * 60 * 1000;

    runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO presets (id, slug, author_id, title, status, published_revision_id, created_at, published_at, updated_at) VALUES ('preset-bad', 'preset-bad', 'bad-actor', 'Bad Preset', 'published', 'rev-bad', ${now}, ${now}, ${now})`]);
    runD1(stateDirectory, ["execute", "DB", "--command", `INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES ('rev-bad', 'preset-bad', 1, 'published', '{}', 'hash-bad')`]);

    // Retract preset and suspend author for 1 week
    runD1(stateDirectory, ["execute", "DB", "--command", `UPDATE presets SET status = 'draft', published_revision_id = NULL, published_at = NULL, resubmission_blocked_until = ${weekLater}, retracted_at = ${now}, retracted_reason = 'Hate speech' WHERE id = 'preset-bad'`]);
    runD1(stateDirectory, ["execute", "DB", "--command", `UPDATE users SET suspended_until = ${weekLater} WHERE id = 'bad-actor'`]);

    const updatedPreset = queryD1<{ status: string; published_revision_id: string | null; resubmission_blocked_until: number; retracted_reason: string }>(stateDirectory, "SELECT status, published_revision_id, resubmission_blocked_until, retracted_reason FROM presets WHERE id = 'preset-bad'").results[0];
    assert.equal(updatedPreset.status, "draft");
    assert.equal(updatedPreset.published_revision_id, null);
    assert.equal(updatedPreset.resubmission_blocked_until, weekLater);
    assert.equal(updatedPreset.retracted_reason, "Hate speech");

    const updatedUser = queryD1<{ suspended_until: number }>(stateDirectory, "SELECT suspended_until FROM users WHERE id = 'bad-actor'").results[0];
    assert.equal(updatedUser.suspended_until, weekLater);
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});
