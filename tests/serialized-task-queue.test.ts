import assert from "node:assert/strict";
import test from "node:test";
import { SerializedTaskQueue } from "../src/lib/serialized-task-queue";

test("serializes tasks with the same key", async () => {
  const queue = new SerializedTaskQueue();
  const events: string[] = [];
  let releaseFirst!: () => void;
  let markFirstStarted!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });

  const first = queue.enqueue("preset", async () => {
    events.push("first:start");
    markFirstStarted();
    await firstGate;
    events.push("first:end");
    return 1;
  });
  const second = queue.enqueue("preset", async () => {
    events.push("second:start");
    return 2;
  });

  await firstStarted;
  assert.deepEqual(events, ["first:start"]);
  assert.equal(queue.hasPending("preset"), true);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
  await Promise.resolve();
  assert.equal(queue.hasPending("preset"), false);
});

test("continues with the next task after a failed save", async () => {
  const queue = new SerializedTaskQueue();
  const first = queue.enqueue("preset", async () => { throw new Error("offline"); });
  const second = queue.enqueue("preset", async () => "saved");

  await assert.rejects(first, /offline/);
  assert.equal(await second, "saved");
});
