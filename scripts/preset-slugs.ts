import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { planPresetSlugs, presetSlugPlanSchema, type PresetSlugSource } from "../src/domain/preset-slug-plan";
import { presetSlugBackfillSql } from "../src/infrastructure/preset-slug-backfill";
import { parseD1QueryRows } from "./wrangler-output";
import { bindRankingSql } from "./ranking-sql";
import { stripColorAndFormattingTags } from "../src/domain/straftat-markup";

const [target = "local", command = "plan", planPath, ...options] = process.argv.slice(2);
if (!["local", "remote"].includes(target) || !["plan", "apply"].includes(command) || !planPath) {
  throw new Error("Usage: npm run slugs -- local|remote plan|apply scratch/slug-plan.json [--confirm rename-published-slugs --backup scratch/slugs-before.json]");
}
if (command === "apply" && (options[options.indexOf("--confirm") + 1] !== "rename-published-slugs"
  || options.indexOf("--backup") < 0 || !options[options.indexOf("--backup") + 1])) {
  throw new Error("Applying requires --confirm rename-published-slugs and --backup <new-file>.");
}
function query<T>(statement: string): T[] {
  try {
    return parseD1QueryRows<T>(execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB",
      `--${target}`, "--command", statement, "--json", "--yes"], {
      encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "true", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
    }));
  } catch { throw new Error(`D1 ${target} slug operation failed. No credentials or query output were printed. Check authentication, migrations and plan freshness.`); }
}
const rows = query<PresetSlugSource>(`SELECT p.id, p.slug, p.status, p.published_revision_id AS revisionId,
  coalesce(json_extract(r.content_json, '$.title'), p.title) AS title FROM presets p
  LEFT JOIN preset_revisions r ON r.id = p.published_revision_id
  ORDER BY coalesce(p.first_published_at, p.created_at), p.id`);
const claims = query<{ slug: string; presetId: string | null }>("SELECT slug, preset_id AS presetId FROM preset_slugs");
if (command === "plan") {
  const plan = planPresetSlugs(rows, claims);
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n", { flag: "wx" });
  console.table(plan.map(p => ({ name: stripColorAndFormattingTags(p.title), current: p.oldSlug, proposed: p.newSlug })));
  console.log(`Read-only plan saved to ${planPath}. Production slugs are unchanged.`);
} else {
  const plan = presetSlugPlanSchema.parse(JSON.parse(readFileSync(planPath, "utf8")));
  for (const p of plan) {
    const row = rows.find(row => row.id === p.id);
    if (!row || row.status !== "published" || row.revisionId !== p.revisionId || row.title !== p.title || ![p.oldSlug, p.newSlug].includes(row.slug)) {
      throw new Error(`Stale slug plan for ${p.id}. Generate and review a new plan.`);
    }
    for (const slug of [p.oldSlug, p.newSlug]) {
      if (claims.some(c => c.slug === slug && c.presetId !== p.id)
        || rows.some(row => row.id !== p.id && (row.id === slug || row.slug === slug))) throw new Error(`Reserved slug: ${slug}`);
    }
  }
  const backupPath = options[options.indexOf("--backup") + 1];
  const protectedRows = query<Record<string, unknown>>("SELECT * FROM presets WHERE status = 'published'");
  writeFileSync(backupPath, JSON.stringify({ capturedAt: new Date().toISOString(), target, presets: protectedRows, claims, plan }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const changed = plan.filter(p => rows.find(row => row.id === p.id)?.slug !== p.newSlug).length;
  const compiled = new SQLiteSyncDialect().sqlToQuery(presetSlugBackfillSql(plan));
  const updated = query<{ id: string; slug: string }>(bindRankingSql(compiled.sql, compiled.params as (string | number | null)[]));
  if (updated.length !== plan.length) throw new Error("Preset state changed during backfill. Inspect the saved backup before retrying.");
  const after = query<Record<string, unknown>>("SELECT * FROM presets WHERE status = 'published'");
  for (const p of plan) {
    const before = protectedRows.find(row => row.id === p.id);
    const current = after.find(row => row.id === p.id);
    if (!before || !current || JSON.stringify(current) !== JSON.stringify({ ...before, slug: p.newSlug })) {
      throw new Error(`Preset ${p.id} changed during verification. Inspect ${backupPath} before further changes.`);
    }
  }
  console.log(`Updated ${changed} canonical slugs. Old links retained. Preset timestamps and content unchanged. Backup: ${backupPath}`);
}
