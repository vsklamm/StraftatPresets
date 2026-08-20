import assert from "node:assert/strict";
import test from "node:test";
import { eventDedupeBucket, normalizeEventTarget } from "../src/domain/preset-events";

test("event cooldown buckets match the interaction type", () => {
  const start = Date.UTC(2026, 7, 14, 12, 0, 0);
  assert.equal(eventDedupeBucket("view", start), eventDedupeBucket("view", start + 29 * 60 * 1_000));
  assert.notEqual(eventDedupeBucket("view", start), eventDedupeBucket("view", start + 30 * 60 * 1_000));
  assert.equal(eventDedupeBucket("copy", start), eventDedupeBucket("copy", start + 4 * 60 * 1_000));
  assert.notEqual(eventDedupeBucket("copy", start), eventDedupeBucket("copy", start + 5 * 60 * 1_000));
});

test("only copy events retain a bounded target", () => {
  assert.equal(normalizeEventTarget("view", "ignored"), "");
  assert.equal(normalizeEventTarget("copy", " map:v5:1 "), "map:v5:1");
  assert.throws(() => normalizeEventTarget("copy"), /need a target/);
  assert.throws(() => normalizeEventTarget("copy", "x".repeat(121)), /too long/);
});
