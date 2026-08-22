import assert from "node:assert/strict";
import test from "node:test";
import { eventDedupeBucket } from "../src/domain/preset-events";

test("event cooldown buckets match the interaction type", () => {
  const start = Date.UTC(2026, 7, 14, 12, 0, 0);
  assert.equal(eventDedupeBucket("view", start), eventDedupeBucket("view", start + 29 * 60 * 1_000));
  assert.notEqual(eventDedupeBucket("view", start), eventDedupeBucket("view", start + 30 * 60 * 1_000));
  assert.equal(eventDedupeBucket("copy", start), eventDedupeBucket("copy", start + 11 * 60 * 60 * 1_000));
  assert.notEqual(eventDedupeBucket("copy", start), eventDedupeBucket("copy", start + 12 * 60 * 60 * 1_000));
});
