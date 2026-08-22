import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tagCatalogEntries } from "../src/domain/tag-catalog";

const target = process.argv[2] ?? "local";
if (target !== "local" && target !== "remote") throw new Error("Usage: sync-tag-catalog.ts local|remote [--confirm 50]");
const confirmation = process.argv[process.argv.indexOf("--confirm") + 1];
if (target === "remote" && confirmation !== String(tagCatalogEntries.length)) {
  throw new Error(`Remote sync requires: --confirm ${tagCatalogEntries.length}`);
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const statements = [
  ...tagCatalogEntries.map((tag, index) => `INSERT INTO tags (slug, label, is_active, sort_order) VALUES (${quote(tag.slug)}, ${quote(tag.label)}, 1, ${(index + 1) * 10}) ON CONFLICT(slug) DO UPDATE SET label = excluded.label, is_active = 1, sort_order = excluded.sort_order, updated_at = (unixepoch() * 1000) WHERE label IS NOT excluded.label OR is_active <> 1 OR sort_order <> excluded.sort_order;`),
];

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "straftat-tag-sync-"));
let rowsWritten = 0;
try {
  const sqlPath = path.join(temporaryDirectory, "tags.sql");
  writeFileSync(sqlPath, `${statements.join("\n")}\n`);
  const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
  const output = execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", target === "remote" ? "--remote" : "--local", "--file", sqlPath, "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
  });
  const results = JSON.parse(output) as Array<{ meta?: { rows_written?: number } }>;
  rowsWritten = results.reduce((total, result) => total + Number(result.meta?.rows_written ?? 0), 0);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Synced ${tagCatalogEntries.length} public tags to ${target} D1: ${rowsWritten} rows written; additional admin tags were left unchanged.`);
