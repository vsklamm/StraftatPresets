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
const statements = [
  "UPDATE game_releases SET is_supported = 0, updated_at = (unixepoch() * 1000);",
  `INSERT INTO game_releases (version, published_at, source_url, catalog_hash, is_supported) VALUES (${quote(gameCatalog.supportedRelease.version)}, ${quote(gameCatalog.supportedRelease.publishedAt)}, ${quote(gameCatalog.supportedRelease.sourceUrl)}, ${quote(catalogHash)}, 1) ON CONFLICT(version) DO UPDATE SET published_at = excluded.published_at, source_url = excluded.source_url, catalog_hash = excluded.catalog_hash, is_supported = 1, updated_at = (unixepoch() * 1000);`,
  "UPDATE game_weapons SET is_active = 0, updated_at = (unixepoch() * 1000);",
  ...gameCatalog.weapons.map((weapon) => `INSERT INTO game_weapons (name, image_path, is_active) VALUES (${quote(weapon.name)}, ${quote(weapon.image)}, 1) ON CONFLICT(name) DO UPDATE SET image_path = excluded.image_path, is_active = 1, updated_at = (unixepoch() * 1000);`),
  "UPDATE game_maps SET is_active = 0, updated_at = (unixepoch() * 1000);",
  ...gameCatalog.maps.map((map) => `INSERT INTO game_maps (name, kind, is_active) VALUES (${quote(map.name)}, ${quote(map.kind)}, 1) ON CONFLICT(name) DO UPDATE SET kind = excluded.kind, is_active = 1, updated_at = (unixepoch() * 1000);`),
];

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "straftat-catalog-sync-"));
try {
  const sqlPath = path.join(temporaryDirectory, "catalog.sql");
  writeFileSync(sqlPath, `${statements.join("\n")}\n`);
  const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
  execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", target === "remote" ? "--remote" : "--local", "--file", sqlPath], {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Synced STRAFTAT ${gameCatalog.supportedRelease.version} to ${target} D1 without deleting historical catalog rows.`);
