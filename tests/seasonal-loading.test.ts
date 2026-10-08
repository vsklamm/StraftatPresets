import assert from "node:assert/strict";
import test from "node:test";
import { scheduleSeasonalLoad, type SeasonalLoadingHost } from "../src/seasonal/load-after-page";

function loadingPage() {
  const events = new EventTarget();
  const image = Object.assign(new EventTarget(), {
    complete: false,
    getBoundingClientRect: () => ({ top: 0, bottom: 100, left: 0, right: 100 }),
  });
  let frame: FrameRequestCallback | undefined;
  let idle: IdleRequestCallback | undefined;
  let timeout: (() => void) | undefined;
  let idleTimeout: number | undefined;
  const host: SeasonalLoadingHost = {
    document: { readyState: "loading", images: [image] },
    innerWidth: 1024, innerHeight: 768,
    addEventListener: (...args) => events.addEventListener(...args),
    removeEventListener: (...args) => events.removeEventListener(...args),
    requestAnimationFrame: (callback) => { frame = callback; return 1; },
    cancelAnimationFrame: () => { frame = undefined; },
    requestIdleCallback: (callback, options) => { idle = callback; idleTimeout = options?.timeout; return 2; },
    cancelIdleCallback: () => { idle = undefined; },
    setTimeout: (callback) => { timeout = callback; return 3; },
    clearTimeout: () => { timeout = undefined; },
  };
  return {
    host, image,
    load: () => { host.document.readyState = "complete"; events.dispatchEvent(new Event("load")); },
    paint: () => { const callback = frame; frame = undefined; callback?.(0); },
    idle: (didTimeout = false) => { const callback = idle; idle = undefined; callback?.({ didTimeout, timeRemaining: () => didTimeout ? 0 : 20 }); },
    idleTimeout: () => idleTimeout,
    timeout: () => { const callback = timeout; timeout = undefined; callback?.(); },
  };
}

test("seasonal downloads wait for page load, a painted page, visible images and browser idle", () => {
  const page = loadingPage();
  let downloads = 0;
  scheduleSeasonalLoad(() => { downloads++; }, page.host);
  page.paint(); page.idle();
  assert.equal(downloads, 0);
  page.load(); page.idle();
  assert.equal(downloads, 0);
  page.paint(); page.paint(); page.idle();
  assert.equal(downloads, 0, "visible preset thumbnails still have priority");
  page.image.complete = true;
  page.image.dispatchEvent(new Event("load"));
  page.idle();
  assert.equal(downloads, 0, "the thumbnail must be painted first");
  page.paint(); page.paint();
  assert.equal(downloads, 0);
  page.idle();
  assert.equal(downloads, 1);
});

test("a busy browser starts seasonal loading after the idle deadline, once the page is ready", () => {
  const page = loadingPage();
  let downloads = 0;
  scheduleSeasonalLoad(() => { downloads++; }, page.host);
  assert.equal(page.idleTimeout(), undefined);
  page.load(); page.paint(); page.paint();
  assert.equal(page.idleTimeout(), undefined, "the deadline must not bypass visible images");
  page.image.complete = true;
  page.image.dispatchEvent(new Event("load"));
  page.paint(); page.paint();
  assert.equal(page.idleTimeout(), 1500);
  assert.equal(downloads, 0);
  page.idle(true);
  assert.equal(downloads, 1);
});

test("offscreen lazy images do not block an eligible effect on an already loaded page", () => {
  const page = loadingPage();
  page.host.document.readyState = "complete";
  page.image.getBoundingClientRect = () => ({ top: 1000, bottom: 1100, left: 0, right: 100 });
  let downloads = 0;
  scheduleSeasonalLoad(() => { downloads++; }, page.host);
  page.paint(); page.paint(); page.idle();
  assert.equal(downloads, 1);
});

test("a failed thumbnail settles and browsers without idle callbacks use a deferred fallback", () => {
  const page = loadingPage();
  page.host.requestIdleCallback = undefined;
  let downloads = 0;
  scheduleSeasonalLoad(() => { downloads++; }, page.host);
  page.load(); page.paint(); page.paint();
  page.timeout();
  assert.equal(downloads, 0);
  page.image.dispatchEvent(new Event("error"));
  page.paint(); page.paint();
  assert.equal(downloads, 0);
  page.timeout();
  assert.equal(downloads, 1);
});

test("leaving the season or page cancels pending load, paint, image, idle and fallback work", () => {
  for (const stage of ["load", "paint", "image", "idle", "fallback"] as const) {
    const page = loadingPage();
    if (stage === "fallback") page.host.requestIdleCallback = undefined;
    let downloads = 0;
    const cancel = scheduleSeasonalLoad(() => { downloads++; }, page.host);
    if (stage !== "load") page.load();
    if (stage !== "load" && stage !== "paint") { page.paint(); page.paint(); }
    if (stage === "idle" || stage === "fallback") {
      page.image.dispatchEvent(new Event("load"));
      page.paint(); page.paint();
    }
    cancel();
    page.load(); page.paint(); page.paint();
    page.image.dispatchEvent(new Event("load"));
    page.paint(); page.paint(); page.idle(); page.timeout();
    assert.equal(downloads, 0, stage);
  }
});
