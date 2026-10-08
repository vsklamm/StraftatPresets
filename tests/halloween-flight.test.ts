import assert from "node:assert/strict";
import test from "node:test";
import { createHalloweenFlight } from "../src/seasonal/halloween/flight";

test("every random flight starts fully offscreen and ends at a visible explosion point", () => {
  for (const edge of [0, 1, 2, 3]) {
    const random = () => (edge + .5) / 4;
    const flight = createHalloweenFlight(random);
    for (const halfWidth of [3.8, 15.5, 24]) {
      const start = flight(0, halfWidth, 8.74);
      const depth = (24 - start.z) / 24;
      assert.ok(Math.abs(start.x) >= halfWidth * depth + 2 || Math.abs(start.y) >= 8.74 * depth + 2);
      const end = flight(1, halfWidth, 8.74);
      const endDepth = (24 - end.z) / 24;
      assert.ok(Math.abs(end.x) < halfWidth * endDepth * .7);
      assert.ok(Math.abs(end.y) < 8.74 * endDepth * .7);
    }
  }
});

test("randomness is sampled per launch, so a flight follows a stable path without per-frame jitter", () => {
  let state = 42;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const first = createHalloweenFlight(random);
  const before = state;
  assert.deepEqual(first(.4, 15, 8.74), first(.4, 15, 8.74));
  assert.equal(state, before);
  assert.notDeepEqual(first(.4, 15, 8.74), createHalloweenFlight(random)(.4, 15, 8.74));
});

test("ambient flights cross the viewport and finish completely beyond the opposite edge", () => {
  let state = 7;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let launch = 0; launch < 100; launch++) {
    const flight = createHalloweenFlight(random, true);
    const afterLaunch = state;
    for (const halfWidth of [3.8, 15.5, 24]) {
      const start = flight(0, halfWidth, 8.74);
      const end = flight(1, halfWidth, 8.74);
      const startDepth = (24 - start.z) / 24;
      const endDepth = (24 - end.z) / 24;
      if (Math.abs(start.x) >= halfWidth * startDepth + 2) {
        assert.ok(Math.abs(end.x) >= halfWidth * endDepth + 2);
        assert.ok(start.x * end.x < 0);
      } else {
        assert.ok(Math.abs(end.y) >= 8.74 * endDepth + 2);
        assert.ok(start.y * end.y < 0);
      }
      const middle = flight(.5, halfWidth, 8.74);
      const depth = (24 - middle.z) / 24;
      assert.ok(Math.abs(middle.x) < halfWidth * depth);
      assert.ok(Math.abs(middle.y) < 8.74 * depth);
    }
    assert.equal(state, afterLaunch, "sampling the route never rerolls it");
  }
});
