import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gameCatalog } from "../src/domain/game-catalog";

const target = process.argv[2] ?? "local";
if (target !== "local" && target !== "remote") throw new Error("Usage: sync-game-catalog.ts local|remote [--confirm VERSION]");
const confirmation = process.argv[process.argv.indexOf("--confirm") + 1];
if (target === "remote" && confirmation !== gameCatalog.supportedRelease.version) {
  throw new Error(`Remote sync requires: --confirm ${gameCatalog.supportedRelease.version}`);
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const catalogBytes = readFileSync("game-data/catalog.json");
const catalogHash = createHash("sha256").update(catalogBytes).digest("hex");
const weaponNames = gameCatalog.weapons.map((weapon) => quote(weapon.name)).join(", ");
const mapNames = gameCatalog.maps.map((map) => quote(map.name)).join(", ");
const statements = [
  `INSERT INTO game_releases (version, published_at, source_url, catalog_hash, is_supported) VALUES (${quote(gameCatalog.supportedRelease.version)}, ${quote(gameCatalog.supportedRelease.publishedAt)}, ${quote(gameCatalog.supportedRelease.sourceUrl)}, ${quote(catalogHash)}, 1) ON CONFLICT(version) DO UPDATE SET published_at = excluded.published_at, source_url = excluded.source_url, catalog_hash = excluded.catalog_hash, is_supported = 1, updated_at = (unixepoch() * 1000) WHERE published_at IS NOT excluded.published_at OR source_url IS NOT excluded.source_url OR catalog_hash IS NOT excluded.catalog_hash OR is_supported <> 1;`,
  `UPDATE game_releases SET is_supported = 0, updated_at = (unixepoch() * 1000) WHERE version <> ${quote(gameCatalog.supportedRelease.version)} AND is_supported <> 0;`,
  ...gameCatalog.weapons.map((weapon) => `INSERT INTO game_weapons (name, image_path, is_active) VALUES (${quote(weapon.name)}, ${quote(weapon.image)}, 1) ON CONFLICT(name) DO UPDATE SET image_path = excluded.image_path, is_active = 1, updated_at = (unixepoch() * 1000) WHERE image_path IS NOT excluded.image_path OR is_active <> 1;`),
  `UPDATE game_weapons SET is_active = 0, updated_at = (unixepoch() * 1000) WHERE is_active <> 0 AND name NOT IN (${weaponNames});`,
  ...gameCatalog.maps.map((map) => `INSERT INTO game_maps (name, kind, is_active) VALUES (${quote(map.name)}, ${quote(map.kind)}, 1) ON CONFLICT(name) DO UPDATE SET kind = excluded.kind, is_active = 1, updated_at = (unixepoch() * 1000) WHERE kind IS NOT excluded.kind OR is_active <> 1;`),
  `UPDATE game_maps SET is_active = 0, updated_at = (unixepoch() * 1000) WHERE is_active <> 0 AND name NOT IN (${mapNames});`,
];

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "straftat-catalog-sync-"));
let rowsWritten = 0;
try {
  const sqlPath = path.join(temporaryDirectory, "catalog.sql");
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

console.log(`Synced STRAFTAT ${gameCatalog.supportedRelease.version} to ${target} D1: ${rowsWritten} rows written.`);
