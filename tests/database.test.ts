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
    for (const table of ["presets", "preset_revisions", "preset_versions", "map_playlists", "map_playlist_maps", "weapon_configurations", "preset_events", "preset_unique_actors", "preset_statistics", "preset_abuse_signals", "tags", "preset_tags", "game_releases", "game_maps", "game_weapons"]) assert.ok(tableNames.includes(table));
    assert.equal(tableNames.includes("likes"), false);
    assert.equal(tableNames.includes("preset_like_events"), false);
    assert.equal(tableNames.includes("game_weapon_aliases"), false);

    const userColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(users)");
    assert.equal(userColumns.results.some((column) => column.name === "image_url"), false);
    assert.equal(userColumns.results.some((column) => column.name === "is_active"), true);
    assert.equal(userColumns.results.some((column) => column.name === "last_login_at"), true);
    assert.equal(userColumns.results.some((column) => column.name === "role"), true);
    const revisionColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(preset_revisions)");
    for (const column of ["telegram_chat_id", "telegram_message_id", "telegram_message_kind", "telegram_message_html", "telegram_decision", "telegram_resolved_at"]) {
      assert.equal(revisionColumns.results.some((entry) => entry.name === column), true);
    }
    const eventColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(preset_events)");
    assert.equal(eventColumns.results.some((column) => column.name === "preset_version_id"), false);
    assert.equal(eventColumns.results.some((column) => column.name === "target_key"), true);
    const statisticsColumns = queryD1<{ name: string }>(stateDirectory, "PRAGMA table_info(preset_statistics)");
    assert.equal(statisticsColumns.results.some((column) => column.name === "likes_count"), false);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO users (id, name) VALUES ('user-1', 'Tester'); INSERT INTO presets (id, slug, author_id, title) VALUES ('preset-1', 'preset-1', 'user-1', 'Preset')"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_events (id, preset_id, kind, actor_hash, client_event_id, target_key, dedupe_bucket) VALUES ('copy-1', 'preset-1', 'copy', 'actor', 'event-1', 'target-a', '2026-08-22'); INSERT INTO preset_events (id, preset_id, kind, actor_hash, client_event_id, target_key, dedupe_bucket) VALUES ('copy-2', 'preset-1', 'copy', 'actor', 'event-2', 'target-b', '2026-08-22')"]);
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_events (id, preset_id, kind, actor_hash, client_event_id, target_key, dedupe_bucket) VALUES ('copy-3', 'preset-1', 'copy', 'actor', 'event-3', 'target-a', '2026-08-22')"]),
      /UNIQUE constraint failed/,
    );
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_events (id, preset_id, kind, actor_hash, client_event_id, target_key, dedupe_bucket) VALUES ('copy-4', 'preset-1', 'copy', 'actor', 'event-4', 'target-a', '2026-08-23')"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_versions (id, preset_id, label) VALUES ('version-1', 'preset-1', 'v1'); INSERT INTO weapon_configurations (id, preset_version_id, kind, name) VALUES ('weapons-1', 'version-1', 'randomized', 'Weapons'); INSERT INTO game_weapons (name, image_path, is_active) VALUES ('Retired Weapon', '/weapons/retired.webp', 0); INSERT INTO game_maps (name, kind, is_active) VALUES ('Retired_Map', 'core', 0); INSERT INTO map_playlists (id, preset_version_id, name, encoded_value, decoded_map_count) VALUES ('maps-1', 'version-1', 'Maps', 'code', 1)"]);
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO randomized_weapons (id, weapon_configuration_id, weapon_name, weight) VALUES ('random-1', 'weapons-1', 'Retired Weapon', 10)"]),
      /weapon is not supported/,
    );
    assert.throws(
      () => runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO map_playlist_maps (map_playlist_id, position, map_name) VALUES ('maps-1', 0, 'Retired_Map')"]),
      /map is not supported/,
    );
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
    runD1(stateDirectory, ["execute", "DB", "--command", "INSERT INTO preset_revisions (id, preset_id, revision_number, status, content_json, content_hash) VALUES ('revision-1', 'preset-1', 1, 'pending', '{}', 'hash'); UPDATE preset_revisions SET status = 'published' WHERE id = 'revision-1'; UPDATE presets SET published_revision_id = 'revision-1' WHERE id = 'preset-1'"]);
    runD1(stateDirectory, ["execute", "DB", "--command", "UPDATE presets SET description = 'A complete test preset.', status = 'published', published_at = unixepoch() * 1000 WHERE id = 'preset-1'; INSERT INTO preset_statistics (preset_id, quality_score_milli) VALUES ('preset-1', 1234); UPDATE preset_versions SET label = 'v1.0' WHERE id = 'version-1'"]);
    assert.equal(queryD1<{ quality: number }>(stateDirectory, "SELECT quality_score_milli AS quality FROM preset_statistics WHERE preset_id = 'preset-1'").results[0].quality, 0);
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
