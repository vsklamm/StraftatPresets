import assert from "node:assert/strict";
import test from "node:test";
import { PendingTaskTracker } from "../src/lib/pending-task-tracker";

test("waitForIdle includes work added while an earlier editor change is pending", async () => {
  const tracker = new PendingTaskTracker();
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const second = new Promise<void>((resolve) => { releaseSecond = resolve; });
  tracker.track(first);

  let settled = false;
  const waiting = tracker.waitForIdle().then(() => { settled = true; });
  tracker.track(second);
  releaseFirst();
  await first;
  await Promise.resolve();
  assert.equal(settled, false);

  releaseSecond();
  await waiting;
  assert.equal(settled, true);
});

test("failed editor work does not block later saves", async () => {
  const tracker = new PendingTaskTracker();
  tracker.track(Promise.reject(new Error("invalid export")));
  await tracker.waitForIdle();
});
