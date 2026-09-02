import assert from "node:assert/strict";
import test from "node:test";
import { eventDedupeBucket } from "../src/domain/preset-events";

test("event cooldown buckets match the interaction type", () => {
  const start = Date.UTC(2026, 7, 14, 12, 0, 0);
  for (const kind of ["view", "link_open", "copy"] as const) {
    assert.equal(eventDedupeBucket(kind, start), eventDedupeBucket(kind, start + 11 * 60 * 60 * 1_000));
    assert.notEqual(eventDedupeBucket(kind, start), eventDedupeBucket(kind, start + 12 * 60 * 60 * 1_000));
  }
});
