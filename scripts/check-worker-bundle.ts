import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_WORKER_GZIP_KIB = 2_500;

const SIZE_UNIT_TO_KIB: Record<string, number> = {
  B: 1 / 1_024,
  KiB: 1,
  MiB: 1_024,
};

export function parseWorkerGzipKiB(output: string): number {
  const matches = [...output.matchAll(/Total Upload:[^\n]*?gzip:\s*([\d.]+)\s*(B|KiB|MiB)/g)];
  const match = matches.at(-1);
  if (!match) throw new Error("Wrangler output did not contain a compressed Worker size");
  return Number(match[1]) * SIZE_UNIT_TO_KIB[match[2]];
}

function main() {
  const wrangler = path.join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(process.execPath, [wrangler, "deploy", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  const gzipKiB = parseWorkerGzipKiB(output);
  if (gzipKiB > MAX_WORKER_GZIP_KIB) {
    throw new Error(`Compressed Worker is ${gzipKiB.toFixed(2)} KiB; budget is ${MAX_WORKER_GZIP_KIB} KiB`);
  }
  console.log(`Worker bundle OK: ${gzipKiB.toFixed(2)} KiB gzip (${(MAX_WORKER_GZIP_KIB - gzipKiB).toFixed(2)} KiB below budget).`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) main();
