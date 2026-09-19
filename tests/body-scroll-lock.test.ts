import assert from "node:assert/strict";
import test from "node:test";
import {
  lockBodyScroll,
  unlockBodyScroll,
  getOpenModalCount,
  resetModalCountForTesting,
} from "../src/lib/body-scroll-lock";

test("lockBodyScroll and unlockBodyScroll manage classes, ref counts, and scroll position", (t) => {
  resetModalCountForTesting();

  const docElementClasses = new Set<string>();
  const bodyClasses = new Set<string>();
  let scrolledTo: { top: number; behavior: string } | null = null;

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  t.after(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    resetModalCountForTesting();
  });

  const mockDocument = {
    documentElement: {
      scrollTop: 140,
      classList: {
        add: (cls: string) => docElementClasses.add(cls),
        remove: (cls: string) => docElementClasses.delete(cls),
        contains: (cls: string) => docElementClasses.has(cls),
      },
    },
    body: {
      classList: {
        add: (cls: string) => bodyClasses.add(cls),
        remove: (cls: string) => bodyClasses.delete(cls),
        contains: (cls: string) => bodyClasses.has(cls),
      },
    },
  };

  const mockWindow = {
    scrollY: 140,
    scrollTo: (options: { top: number; behavior: string }) => {
      scrolledTo = options;
    },
  };

  globalThis.document = mockDocument as unknown as Document;
  globalThis.window = mockWindow as unknown as (Window & typeof globalThis);

  assert.equal(getOpenModalCount(), 0);
  assert.equal(mockDocument.documentElement.classList.contains("modal-open"), false);
  assert.equal(mockDocument.body.classList.contains("modal-open"), false);

  // Open first modal
  lockBodyScroll();
  assert.equal(getOpenModalCount(), 1);
  assert.equal(mockDocument.documentElement.classList.contains("modal-open"), true);
  assert.equal(mockDocument.body.classList.contains("modal-open"), true);

  // Open second modal (e.g. auth prompt over preset card)
  lockBodyScroll();
  assert.equal(getOpenModalCount(), 2);
  assert.equal(mockDocument.documentElement.classList.contains("modal-open"), true);
  assert.equal(mockDocument.body.classList.contains("modal-open"), true);

  // Close second modal
  unlockBodyScroll();
  assert.equal(getOpenModalCount(), 1);
  assert.equal(mockDocument.documentElement.classList.contains("modal-open"), true);
  assert.equal(mockDocument.body.classList.contains("modal-open"), true);

  // Simulate scroll offset change by a mobile browser glitch
  mockWindow.scrollY = 0;
  mockDocument.documentElement.scrollTop = 0;

  // Close first modal
  unlockBodyScroll();
  assert.equal(getOpenModalCount(), 0);
  assert.equal(mockDocument.documentElement.classList.contains("modal-open"), false);
  assert.equal(mockDocument.body.classList.contains("modal-open"), false);

  // Preserved scroll position was restored
  assert.deepEqual(scrolledTo, { top: 140, behavior: "instant" });
});
