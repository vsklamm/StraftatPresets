import assert from "node:assert/strict";
import test from "node:test";
import { observeAnimationVisibility } from "../src/lib/animation-visibility";

test("decorative motion pauses offscreen and in hidden tabs, resumes and cleans up", (t) => {
  let callback: IntersectionObserverCallback = () => {};
  let disconnected = false;
  let observed: Element | undefined;
  class Observer {
    constructor(cb: IntersectionObserverCallback) { callback = cb; }
    observe(element: Element) { observed = element; }
    disconnect() { disconnected = true; }
  }
  const original = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
  t.after(() => { globalThis.IntersectionObserver = original; });
  const document = new EventTarget() as EventTarget & { hidden: boolean };
  document.hidden = false;
  const values = new Map<string, string>();
  let paused = false;
  const element = {
    ownerDocument: document,
    style: { setProperty: (key: string, value: string) => values.set(key, value), removeProperty: (key: string) => values.delete(key) },
    toggleAttribute: (_key: string, value: boolean) => { paused = value; },
    removeAttribute: () => { paused = false; },
  } as unknown as HTMLElement;
  const cleanup = observeAnimationVisibility(element);
  assert.equal(observed, element);
  assert.equal(values.get("--ambient-animation-state"), "paused");
  const intersect = (isIntersecting: boolean) => callback([{ target: element, isIntersecting } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
  intersect(true);
  assert.equal(values.get("--ambient-animation-state"), "running");
  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(paused, true);
  intersect(false);
  document.hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(paused, true);
  intersect(true);
  assert.equal(paused, false);
  cleanup();
  assert.equal(disconnected, true);
  assert.equal(values.size, 0);
  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(values.size, 0);
});
