import { execFileSync } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [target = "local"] = process.argv.slice(2);
if (target !== "local" && target !== "remote") throw new Error("Usage: node scripts/backup.mjs local|remote");

const backupDirectory = path.resolve(process.env.BACKUP_DIR ?? "./backups");
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const stamp = new Date().toISOString().replaceAll(":", "-");
const destination = path.join(backupDirectory, `straftat-presets-${target}-${stamp}.sql`);
await mkdir(backupDirectory, { recursive: true });

const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
execFileSync(process.execPath, [wrangler, "d1", "export", "DB", `--${target}`, "--output", destination, "--skip-confirmation"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1_000;
for (const file of await readdir(backupDirectory, { withFileTypes: true })) {
  if (!file.isFile() || !file.name.startsWith(`straftat-presets-${target}-`) || !file.name.endsWith(".sql")) continue;
  const filePath = path.join(backupDirectory, file.name);
  if ((await stat(filePath)).mtimeMs < cutoff) await rm(filePath);
}
console.log(destination);
