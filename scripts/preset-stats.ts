import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "node:path";
import process from "node:process";
import { PresetRankingStore, type RankingProjection } from "../src/infrastructure/preset-ranking-store";
import { parseD1QueryRows } from "./wrangler-output";
import { bindRankingSql } from "./ranking-sql";

const [target = "local", command = "list", value, reason] = process.argv.slice(2);
if (target !== "local" && target !== "remote") throw new Error("Use local or remote as the first argument.");
if (!["list", "inspect", "rebuild", "refresh-ranking", "invalidate", "restore"].includes(command)) throw new Error("Commands: list, inspect, rebuild, refresh-ranking, invalidate, restore");

function query<T>(statement: string, params: readonly (string | number | null)[] = []): T[] {
  try {
    const output = execFileSync(process.execPath, [path.resolve("node_modules/wrangler/bin/wrangler.js"),
      "d1", "execute", "DB", `--${target}`, "--command", bindRankingSql(statement, params), "--json", "--yes"], {
      encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, CI: "true", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseD1QueryRows<T>(output);
  } catch {
    // Do not print SQL parameters, event identities or the child's environment.
    throw new Error(`D1 ${target} statistics query failed. Check migrations and Wrangler authentication.`);
  }
}

// Listing stays read-only and reports the authoritative snapshot, not an approximation.
if (command === "list" || command === "inspect") {
  if (command === "inspect" && !value) throw new Error("An inspected preset ID is required.");
  const [cache] = query<{ payload: string | null }>("SELECT payload FROM preset_ranking_cache WHERE id = 1");
  if (!cache?.payload) {
    console.log("Ranking needs recalculation. The next Popular request or refresh-ranking command will rebuild it.");
  } else {
    const projection = JSON.parse(cache.payload) as RankingProjection;
    console.log(`Ranking v${projection.version}, calculated ${new Date(projection.generatedAt).toISOString()} (cached snapshot).`);
    console.table(projection.items.filter((item) => !value || item.id === value).map(({ id, slug, quality, engagement, freshness, surge, lucky, score }) => ({ id, slug, quality, engagement, freshness, surge, lucky, score })));
  }
  if (command === "inspect") {
    console.log("Public counters");
    console.table(query("SELECT views_total AS opens, link_opens_total AS links, copies_total AS copies, abuse_signal_count AS rejected FROM preset_statistics WHERE preset_id = ?", [value!]));
    console.log("Recent accepted events");
    console.table(query("SELECT id, kind, is_authenticated AS auth, substr(actor_hash, 1, 12) AS actor, substr(coalesce(network_hash, ''), 1, 12) AS network, is_invalidated AS invalid, datetime(created_at / 1000, 'unixepoch') AS created FROM preset_events WHERE preset_id = ? ORDER BY created_at DESC LIMIT 50", [value!]));
    console.log("Network concentration");
    console.table(query("SELECT kind, substr(network_hash, 1, 12) AS network, count(*) AS events, count(DISTINCT actor_hash) AS actors FROM preset_events WHERE preset_id = ? AND is_invalidated = 0 AND coalesce(network_hash, '') <> '' GROUP BY kind, network_hash ORDER BY events DESC LIMIT 30", [value!]));
    console.log("Rejected attempts");
    console.table(query("SELECT kind, reason, day_bucket AS day, attempt_count AS attempts, substr(actor_hash, 1, 12) AS actor, substr(network_hash, 1, 12) AS network FROM preset_abuse_signals WHERE preset_id = ? ORDER BY last_seen_at DESC LIMIT 50", [value!]));
  }
} else {
  // Same secret as deployed event identities. Never use the local fallback for prod.
  if (target === "remote") {
    const production = parseEnv(readFileSync(".env.production", "utf8"));
    // Match --secrets-file exactly, even when the invoking shell has dev secrets.
    for (const key of ["ANALYTICS_HASH_SECRET", "NEXTAUTH_SECRET"] as const) {
      if (production[key]) process.env[key] = production[key];
      else delete process.env[key];
    }
    if (!process.env.ANALYTICS_HASH_SECRET && !process.env.NEXTAUTH_SECRET) throw new Error("Production analytics hashing secret is required.");
  } else {
    try { process.loadEnvFile(".dev.vars"); } catch { /* local fallback matches the Worker */ }
  }
  const { analyticsHash } = await import("../src/lib/analytics-hash");
  const store = new PresetRankingStore(async <T>(sql: string, params?: readonly (string | number | null)[]) => query<T>(sql, params), analyticsHash);
  let counterPreset = value;
  if (command === "invalidate" || command === "restore") {
    if (!value) throw new Error("An event ID is required.");
    const [event] = query<{ preset_id: string }>("SELECT preset_id FROM preset_events WHERE id = ?", [value]);
    if (!event) throw new Error("Event does not exist.");
    if (command === "invalidate" && !reason?.trim()) throw new Error("An audit reason is required.");
    query("UPDATE preset_events SET is_invalidated = ?, invalidated_at = ?, invalidated_reason = ? WHERE id = ?",
      [command === "invalidate" ? 1 : 0, command === "invalidate" ? Date.now() : null, command === "invalidate" ? reason!.trim() : null, value]);
    counterPreset = event.preset_id;
  }
  if (command !== "refresh-ranking") {
    const ids = counterPreset ? [{ id: counterPreset }] : query<{ id: string }>("SELECT id FROM presets");
    for (const { id } of ids) {
      // Only administrative rebuilds change public counters. Ranking never does.
      query("DELETE FROM preset_unique_actors WHERE preset_id = ?", [id]);
      query(`INSERT INTO preset_unique_actors (preset_id, kind, actor_hash, is_authenticated, first_seen_at)
        SELECT preset_id, kind, actor_hash, max(is_authenticated), min(created_at)
        FROM preset_events WHERE preset_id = ? AND is_invalidated = 0 GROUP BY preset_id, kind, actor_hash`, [id]);
      query("INSERT INTO preset_statistics (preset_id) VALUES (?) ON CONFLICT(preset_id) DO NOTHING", [id]);
      query(`UPDATE preset_statistics SET
        views_total = (SELECT count(DISTINCT actor_hash || ':' || date(created_at / 1000, 'unixepoch')) FROM preset_events WHERE preset_id = ? AND kind IN ('view','link_open') AND is_invalidated = 0),
        views_unique_anonymous = (SELECT count(DISTINCT actor_hash) FROM preset_events WHERE preset_id = ? AND kind IN ('view','link_open') AND is_invalidated = 0 AND is_authenticated = 0),
        views_unique_authenticated = (SELECT count(DISTINCT actor_hash) FROM preset_events WHERE preset_id = ? AND kind IN ('view','link_open') AND is_invalidated = 0 AND is_authenticated = 1),
        link_opens_total = (SELECT count(*) FROM preset_events WHERE preset_id = ? AND kind = 'link_open' AND is_invalidated = 0),
        link_opens_unique_anonymous = (SELECT count(*) FROM preset_unique_actors WHERE preset_id = ? AND kind = 'link_open' AND is_authenticated = 0),
        link_opens_unique_authenticated = (SELECT count(*) FROM preset_unique_actors WHERE preset_id = ? AND kind = 'link_open' AND is_authenticated = 1),
        copies_total = (SELECT count(*) FROM preset_events WHERE preset_id = ? AND kind = 'copy' AND is_invalidated = 0),
        copies_unique_anonymous = (SELECT count(*) FROM preset_unique_actors WHERE preset_id = ? AND kind = 'copy' AND is_authenticated = 0),
        copies_unique_authenticated = (SELECT count(*) FROM preset_unique_actors WHERE preset_id = ? AND kind = 'copy' AND is_authenticated = 1),
        abuse_signal_count = (SELECT coalesce(sum(attempt_count), 0) FROM preset_abuse_signals WHERE preset_id = ?),
        last_engagement_at = (SELECT max(created_at) FROM preset_events WHERE preset_id = ? AND is_invalidated = 0),
        updated_at = ? WHERE preset_id = ?`, [...Array<string>(11).fill(id), Date.now(), id]);
    }
  }
  const projection = await store.get(Date.now(), true);
  // Legacy Q/E columns are a compatibility mirror, never a ranking input.
  query(`UPDATE preset_statistics SET
    quality_score_milli = coalesce((SELECT round(json_extract(j.value, '$.quality') * 1000) FROM preset_ranking_cache c, json_each(c.payload, '$.items') j WHERE c.id = 1 AND json_extract(j.value, '$.id') = preset_id), 0),
    engagement_score_milli = coalesce((SELECT round(json_extract(j.value, '$.engagement') * 1000) FROM preset_ranking_cache c, json_each(c.payload, '$.items') j WHERE c.id = 1 AND json_extract(j.value, '$.id') = preset_id), 0)`);
  console.log(`Recalculated ranking v${projection.version} for ${projection.items.length} published presets. Public counters ${command === "refresh-ranking" ? "unchanged" : "rebuilt"}.`);
}
