import assert from "node:assert/strict";
import test from "node:test";
import { recordPresetInteraction } from "../src/lib/preset-interactions-client";

function installBrowserMocks(fetchImplementation: typeof fetch) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  globalThis.fetch = fetchImplementation;
  return () => {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    globalThis.fetch = originalFetch;
  };
}

test("copy tracking is optimistic and sends at most one request per local cooldown", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const restore = installBrowserMocks(async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return Response.json({ counted: true, reason: "counted", statistics: { copies: { total: 7 } } });
  });

  try {
    let optimisticIncrements = 0;
    const first = await recordPresetInteraction("preset-1", "copy", () => { optimisticIncrements += 1; });
    const second = await recordPresetInteraction("preset-1", "copy", () => { optimisticIncrements += 1; });

    assert.equal(optimisticIncrements, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/presets/preset-1/events");
    assert.deepEqual(Object.keys(requests[0].body).sort(), ["eventId", "kind"]);
    assert.equal(requests[0].body.kind, "copy");
    assert.equal(first?.statistics?.copies.total, 7);
    assert.equal(second, undefined);
  } finally {
    restore();
  }
});

test("a failed copy request releases the local cooldown for a retry", async () => {
  let requestCount = 0;
  const restore = installBrowserMocks(async () => {
    requestCount += 1;
    throw new Error("offline");
  });

  try {
    await assert.rejects(recordPresetInteraction("preset-2", "copy"), /offline/);
    await assert.rejects(recordPresetInteraction("preset-2", "copy"), /offline/);
    assert.equal(requestCount, 2);
  } finally {
    restore();
  }
});
