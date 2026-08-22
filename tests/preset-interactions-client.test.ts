import assert from "node:assert/strict";
import test from "node:test";
import { recordPresetCopy } from "../src/lib/preset-interactions-client";

function installBrowserMocks(fetchImplementation: typeof fetch) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  const pageHideListeners = new Set<() => void>();
  const localStorage = {
    get length() { return storage.size; },
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => [...storage.keys()][index] ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  const beacons: Array<{ url: string; body: Blob }> = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      addEventListener: (kind: string, listener: () => void) => { if (kind === "pagehide") pageHideListeners.add(listener); },
      removeEventListener: (kind: string, listener: () => void) => { if (kind === "pagehide") pageHideListeners.delete(listener); },
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { sendBeacon: (url: string, body: Blob) => { beacons.push({ url, body }); return true; } },
  });
  globalThis.fetch = fetchImplementation;
  return {
    beacons,
    triggerPageHide: () => { for (const listener of pageHideListeners) listener(); },
    restore: () => {
      if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
      else Reflect.deleteProperty(globalThis, "window");
      if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      else Reflect.deleteProperty(globalThis, "navigator");
      globalThis.fetch = originalFetch;
    },
  };
}

const publicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const targetA = "a".repeat(64);
const targetB = "b".repeat(64);

test("each copy target is sent immediately at most once per local day", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown>; keepalive: boolean | undefined }> = [];
  const browser = installBrowserMocks(async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      keepalive: init?.keepalive,
    });
    return Response.json({ counted: true, reason: "counted", statistics: { copies: { total: 7 } } });
  });

  try {
    let optimisticIncrements = 0;
    const first = await recordPresetCopy("preset-1", publicationId, targetA, () => { optimisticIncrements += 1; });
    const repeated = await recordPresetCopy("preset-1", publicationId, targetA, () => { optimisticIncrements += 1; });
    await recordPresetCopy("preset-1", publicationId, targetB, () => { optimisticIncrements += 1; });

    assert.equal(optimisticIncrements, 2);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "/api/presets/preset-1/events");
    assert.equal(requests[0].keepalive, true);
    assert.deepEqual(Object.keys(requests[0].body).sort(), ["eventId", "kind", "publicationId", "targetKey"]);
    assert.equal(requests[0].body.kind, "copy");
    assert.equal(requests[0].body.targetKey, targetA);
    assert.equal(first?.statistics?.copies.total, 7);
    assert.equal(repeated, undefined);
  } finally {
    browser.restore();
  }
});

test("a failed copy remains pending and retries with the same event id", async () => {
  const eventIds: unknown[] = [];
  const browser = installBrowserMocks(async (_input, init) => {
    eventIds.push((JSON.parse(String(init?.body)) as Record<string, unknown>).eventId);
    throw new Error("offline");
  });

  try {
    let optimisticIncrements = 0;
    await assert.rejects(recordPresetCopy("preset-2", publicationId, targetA, () => { optimisticIncrements += 1; }), /offline/);
    await assert.rejects(recordPresetCopy("preset-2", publicationId, targetA, () => { optimisticIncrements += 1; }), /offline/);
    assert.equal(optimisticIncrements, 1);
    assert.equal(eventIds.length, 2);
    assert.equal(eventIds[0], eventIds[1]);
  } finally {
    browser.restore();
  }
});

test("an ignored stale copy can be attempted again from current content", async () => {
  let requestCount = 0;
  const browser = installBrowserMocks(async () => {
    requestCount += 1;
    return Response.json(requestCount === 1
      ? { counted: false, reason: "ignored", statistics: { copies: { total: 3 } } }
      : { counted: true, reason: "counted", statistics: { copies: { total: 4 } } });
  });

  try {
    await recordPresetCopy("preset-stale", publicationId, targetA);
    const result = await recordPresetCopy("preset-stale", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", targetA);
    assert.equal(requestCount, 2);
    assert.equal(result?.counted, true);
  } finally {
    browser.restore();
  }
});

test("an in-flight copy is repeated with sendBeacon when the page closes", async () => {
  let resolveRequest: ((response: Response) => void) | undefined;
  const browser = installBrowserMocks(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));

  try {
    const request = recordPresetCopy("preset-3", publicationId, targetA);
    browser.triggerPageHide();
    assert.equal(browser.beacons.length, 1);
    assert.equal(browser.beacons[0].url, "/api/presets/preset-3/events");
    assert.equal((JSON.parse(await browser.beacons[0].body.text()) as Record<string, unknown>).targetKey, targetA);
    resolveRequest?.(Response.json({ counted: true, reason: "counted", statistics: { copies: { total: 1 } } }));
    await request;
  } finally {
    browser.restore();
  }
});
