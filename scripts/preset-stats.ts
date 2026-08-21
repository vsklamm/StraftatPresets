import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { calculatePresetRanking, scoreToMilli, type PresetContentSignals, type PresetEngagementSignals } from "../src/domain/preset-ranking";

type Target = "local" | "remote";
type Row = Record<string, string | number | null>;

const [target = "local", command = "list", value, extra] = process.argv.slice(2) as [Target?, string?, string?, string?];
if (target !== "local" && target !== "remote") throw new Error("Use npm run stats for local D1 or npm run stats:remote for production D1.");

const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
const number = (value: string | number | null | undefined) => Number(value ?? 0);

function query<T extends Row>(statement: string) {
  const output = execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", `--${target}`, "--command", statement, "--json", "--yes"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, CI: "true", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
  });
  return (JSON.parse(output)[0]?.results ?? []) as T[];
}

function rebuildUniqueActors(presetId: string) {
  query(`DELETE FROM preset_unique_actors WHERE preset_id = ${quote(presetId)};
    INSERT INTO preset_unique_actors (preset_id, kind, actor_hash, is_authenticated, first_seen_at, last_seen_at, event_count)
    SELECT preset_id, kind, actor_hash, MAX(is_authenticated), MIN(created_at), MAX(created_at), COUNT(*)
    FROM preset_events
    WHERE preset_id = ${quote(presetId)} AND is_invalidated = 0
    GROUP BY preset_id, kind, actor_hash`);
}

function loadRankingInput(presetId: string) {
  const row = query<Row>(`SELECT
      p.id, p.title, p.description, p.thumbnail_key, p.published_at,
      (SELECT COUNT(*) FROM preset_versions WHERE preset_id = p.id) AS version_count,
      (SELECT COUNT(*) FROM map_playlists JOIN preset_versions ON preset_versions.id = map_playlists.preset_version_id WHERE preset_versions.preset_id = p.id) AS playlist_count,
      (SELECT COUNT(*) FROM preset_tags WHERE preset_id = p.id) AS tag_count,
      (SELECT COUNT(*) FROM weapon_configurations JOIN preset_versions ON preset_versions.id = weapon_configurations.preset_version_id WHERE preset_versions.preset_id = p.id) AS weapon_count,
      (SELECT COUNT(*) FROM preset_events WHERE preset_id = p.id AND kind = 'view' AND is_invalidated = 0) AS views_total,
      (SELECT COUNT(*) FROM preset_unique_actors WHERE preset_id = p.id AND kind = 'view' AND is_authenticated = 0) AS views_anon,
      (SELECT COUNT(*) FROM preset_unique_actors WHERE preset_id = p.id AND kind = 'view' AND is_authenticated = 1) AS views_auth,
      (SELECT COUNT(*) FROM preset_events WHERE preset_id = p.id AND kind = 'link_open' AND is_invalidated = 0) AS links_total,
      (SELECT COUNT(*) FROM preset_unique_actors WHERE preset_id = p.id AND kind = 'link_open' AND is_authenticated = 0) AS links_anon,
      (SELECT COUNT(*) FROM preset_unique_actors WHERE preset_id = p.id AND kind = 'link_open' AND is_authenticated = 1) AS links_auth,
      (SELECT COUNT(*) FROM preset_events WHERE preset_id = p.id AND kind = 'copy' AND is_invalidated = 0) AS copies_total,
      (SELECT COUNT(*) FROM preset_unique_actors WHERE preset_id = p.id AND kind = 'copy' AND is_authenticated = 0) AS copies_anon,
      (SELECT COUNT(*) FROM preset_unique_actors WHERE preset_id = p.id AND kind = 'copy' AND is_authenticated = 1) AS copies_auth,
      (SELECT COALESCE(SUM(attempt_count), 0) FROM preset_abuse_signals WHERE preset_id = p.id) AS abuse_count,
      (SELECT MAX(created_at) FROM preset_events WHERE preset_id = p.id AND is_invalidated = 0) AS last_event_at
    FROM presets p WHERE p.id = ${quote(presetId)}`)[0];
  if (!row) throw new Error(`Preset ${presetId} does not exist.`);

  const content: PresetContentSignals = {
    title: String(row.title),
    description: String(row.description),
    hasThumbnail: Boolean(row.thumbnail_key),
    versionCount: number(row.version_count),
    mapPlaylistCount: number(row.playlist_count),
    mapPlaylistWithDescriptionCount: 0,
    tagCount: number(row.tag_count),
    weaponConfigurationCount: number(row.weapon_count),
  };
  const engagement: PresetEngagementSignals = {
    opens: { total: number(row.views_total), uniqueAnonymous: number(row.views_anon), uniqueAuthenticated: number(row.views_auth) },
    linkOpens: { total: number(row.links_total), uniqueAnonymous: number(row.links_anon), uniqueAuthenticated: number(row.links_auth) },
    copies: { total: number(row.copies_total), uniqueAnonymous: number(row.copies_anon), uniqueAuthenticated: number(row.copies_auth) },
  };
  return { row, content, engagement };
}

function rebuildStatistics(presetId: string) {
  rebuildUniqueActors(presetId);
  const { row, content, engagement } = loadRankingInput(presetId);
  const ranking = calculatePresetRanking(content, engagement, row.published_at === null ? null : number(row.published_at));
  const lastEvent = row.last_event_at === null ? "NULL" : String(number(row.last_event_at));
  query(`INSERT INTO preset_statistics (
      preset_id, views_total, views_unique_anonymous, views_unique_authenticated,
      link_opens_total, link_opens_unique_anonymous, link_opens_unique_authenticated,
      copies_total, copies_unique_anonymous, copies_unique_authenticated,
      quality_score_milli, engagement_score_milli, abuse_signal_count, last_engagement_at, updated_at
    ) VALUES (
      ${quote(presetId)}, ${engagement.opens.total}, ${engagement.opens.uniqueAnonymous}, ${engagement.opens.uniqueAuthenticated},
      ${engagement.linkOpens.total}, ${engagement.linkOpens.uniqueAnonymous}, ${engagement.linkOpens.uniqueAuthenticated},
      ${engagement.copies.total}, ${engagement.copies.uniqueAnonymous}, ${engagement.copies.uniqueAuthenticated},
      ${scoreToMilli(ranking.quality)}, ${scoreToMilli(ranking.engagement)}, ${number(row.abuse_count)}, ${lastEvent}, unixepoch() * 1000
    ) ON CONFLICT(preset_id) DO UPDATE SET
      views_total = excluded.views_total,
      views_unique_anonymous = excluded.views_unique_anonymous,
      views_unique_authenticated = excluded.views_unique_authenticated,
      link_opens_total = excluded.link_opens_total,
      link_opens_unique_anonymous = excluded.link_opens_unique_anonymous,
      link_opens_unique_authenticated = excluded.link_opens_unique_authenticated,
      copies_total = excluded.copies_total,
      copies_unique_anonymous = excluded.copies_unique_anonymous,
      copies_unique_authenticated = excluded.copies_unique_authenticated,
      quality_score_milli = excluded.quality_score_milli,
      engagement_score_milli = excluded.engagement_score_milli,
      abuse_signal_count = excluded.abuse_signal_count,
      last_engagement_at = excluded.last_engagement_at,
      updated_at = excluded.updated_at`);
  return ranking;
}

function listPresets(filterId?: string) {
  const where = filterId ? `WHERE p.id = ${quote(filterId)}` : "WHERE p.status = 'published'";
  return query<Row>(`SELECT
      p.id, p.title,
      ROUND(COALESCE(ps.quality_score_milli, 0) / 1000.0, 2) AS quality,
      ROUND(COALESCE(ps.engagement_score_milli, 0) / 1000.0, 2) AS engagement,
      ROUND((COALESCE(ps.quality_score_milli, 0) + COALESCE(ps.engagement_score_milli, 0) + CASE
        WHEN p.published_at IS NULL THEN 0
        WHEN (unixepoch() * 1000) <= p.published_at THEN 4000
        WHEN (unixepoch() * 1000) - p.published_at >= 1209600000 THEN 0
        ELSE ROUND(4000 * (1.0 - ((unixepoch() * 1000) - p.published_at) / 1209600000.0))
      END) / 1000.0, 2) AS score,
      COALESCE(ps.views_total, 0) AS opens,
      COALESCE(ps.link_opens_total, 0) AS links,
      COALESCE(ps.copies_total, 0) AS copies,
      COALESCE(ps.views_unique_anonymous, 0) + COALESCE(ps.views_unique_authenticated, 0) +
        COALESCE(ps.link_opens_unique_anonymous, 0) + COALESCE(ps.link_opens_unique_authenticated, 0) +
        COALESCE(ps.copies_unique_anonymous, 0) + COALESCE(ps.copies_unique_authenticated, 0) AS unique_events,
      COALESCE(ps.abuse_signal_count, 0) AS rejected,
      CASE WHEN COALESCE(ps.views_total, 0) + COALESCE(ps.link_opens_total, 0) + COALESCE(ps.copies_total, 0) >= 8
        AND 4 * (COALESCE(ps.views_unique_anonymous, 0) + COALESCE(ps.views_unique_authenticated, 0) +
          COALESCE(ps.link_opens_unique_anonymous, 0) + COALESCE(ps.link_opens_unique_authenticated, 0) +
          COALESCE(ps.copies_unique_anonymous, 0) + COALESCE(ps.copies_unique_authenticated, 0)) <
          COALESCE(ps.views_total, 0) + COALESCE(ps.link_opens_total, 0) + COALESCE(ps.copies_total, 0)
        THEN 'review' ELSE '' END AS flag
    FROM presets p LEFT JOIN preset_statistics ps ON ps.preset_id = p.id
    ${where}
    ORDER BY score DESC, p.title`);
}

if (command === "list") {
  console.table(listPresets());
} else if (command === "inspect") {
  if (!value) throw new Error("Usage: npm run stats -- inspect PRESET_ID");
  console.table(listPresets(value));
  console.log("Recent accepted events");
  console.table(query<Row>(`SELECT id, kind, is_authenticated AS auth, SUBSTR(actor_hash, 1, 12) AS actor, SUBSTR(COALESCE(network_hash, ''), 1, 12) AS network, is_invalidated AS invalid, datetime(created_at / 1000, 'unixepoch') AS created FROM preset_events WHERE preset_id = ${quote(value)} ORDER BY created_at DESC LIMIT 50`));
  console.log("Network concentration");
  console.table(query<Row>(`SELECT kind, SUBSTR(network_hash, 1, 12) AS network, COUNT(*) AS events, COUNT(DISTINCT actor_hash) AS actors FROM preset_events WHERE preset_id = ${quote(value)} AND is_invalidated = 0 AND COALESCE(network_hash, '') <> '' GROUP BY kind, network_hash ORDER BY events DESC LIMIT 30`));
  console.log("Rejected attempts");
  console.table(query<Row>(`SELECT kind, reason, day_bucket AS day, attempt_count AS attempts, SUBSTR(actor_hash, 1, 12) AS actor, SUBSTR(network_hash, 1, 12) AS network FROM preset_abuse_signals WHERE preset_id = ${quote(value)} ORDER BY last_seen_at DESC LIMIT 50`));
} else if (command === "rebuild") {
  const ids = value ? [{ id: value }] : query<{ id: string }>("SELECT id FROM presets ORDER BY id");
  for (const row of ids) console.log(row.id, rebuildStatistics(row.id));
} else if (command === "invalidate" || command === "restore") {
  if (!value) throw new Error(`Usage: npm run stats -- ${command} EVENT_ID${command === "invalidate" ? ' "reason"' : ""}`);
  const event = query<{ preset_id: string }>(`SELECT preset_id FROM preset_events WHERE id = ${quote(value)}`)[0];
  if (!event) throw new Error(`Event ${value} does not exist.`);
  if (command === "invalidate") {
    if (!extra?.trim()) throw new Error('Add an audit reason, for example: npm run stats -- invalidate EVENT_ID "boosting"');
    query(`UPDATE preset_events SET is_invalidated = 1, invalidated_at = unixepoch() * 1000, invalidated_reason = ${quote(extra.trim())} WHERE id = ${quote(value)}`);
  } else {
    query(`UPDATE preset_events SET is_invalidated = 0, invalidated_at = NULL, invalidated_reason = NULL WHERE id = ${quote(value)}`);
  }
  console.log(event.preset_id, rebuildStatistics(event.preset_id));
} else {
  throw new Error("Commands: list, inspect, rebuild, invalidate, restore");
}
