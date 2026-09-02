import assert from "node:assert/strict";
import test from "node:test";
import { MAX_WORKER_GZIP_KIB, parseWorkerGzipKiB } from "../scripts/check-worker-bundle";

test("reads Wrangler's compressed Worker size", () => {
  assert.equal(parseWorkerGzipKiB("Total Upload: 6584.05 KiB / gzip: 1370.38 KiB"), 1370.38);
  assert.equal(parseWorkerGzipKiB("Total Upload: 6.4 MiB / gzip: 1.25 MiB"), 1_280);
});

test("rejects Wrangler output without a compressed size", () => {
  assert.throws(() => parseWorkerGzipKiB("dry run complete"), /compressed Worker size/);
});

test("keeps the bundle budget below Cloudflare Free's platform limit", () => {
  assert.ok(MAX_WORKER_GZIP_KIB < 3 * 1_024);
});
