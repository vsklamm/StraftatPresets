import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ranking shortcuts select the read-only list command for the correct database", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(scripts["ranks:local"], "tsx scripts/preset-stats.ts local list");
  assert.equal(scripts["ranks:prod"], "tsx scripts/preset-stats.ts remote list");
});
