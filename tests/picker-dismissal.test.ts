import assert from "node:assert/strict";
import test from "node:test";
import { observePickerDismissal } from "../src/lib/picker-dismissal";

test("pickers dismiss on Escape and outside clicks, ignore their contents and trigger, and clean up", (t) => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const window = new EventTarget();
  const document = new EventTarget();
  globalThis.window = window as unknown as Window & typeof globalThis;
  globalThis.document = document as unknown as Document;
  let cleanup = () => {};
  t.after(() => {
    cleanup();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });
  const contentChild = {} as Node;
  const triggerChild = {} as Node;
  const outside = {} as Node;
  const content = { contains: (node: Node) => node === content || node === contentChild } as unknown as HTMLElement;
  const trigger = { contains: (node: Node) => node === trigger || node === triggerChild } as unknown as HTMLElement;
  const containerRef = { current: content as HTMLElement | null };
  const triggerRef = { current: trigger as HTMLElement | null };
  let dismissed = 0;
  cleanup = observePickerDismissal(containerRef, triggerRef, () => { dismissed += 1; });
  const click = (target: Node) => {
    const event = new Event("mousedown");
    Object.defineProperty(event, "target", { value: target });
    document.dispatchEvent(event);
  };
  const key = (value: string) => {
    const event = new Event("keydown");
    Object.defineProperty(event, "key", { value });
    window.dispatchEvent(event);
  };

  [content, contentChild, trigger, triggerChild].forEach(click);
  key("Enter");
  assert.equal(dismissed, 0);
  click(outside);
  assert.equal(dismissed, 1);
  key("Escape");
  assert.equal(dismissed, 2);

  triggerRef.current = { contains: (node: Node) => node === outside } as unknown as HTMLElement;
  click(outside);
  assert.equal(dismissed, 2);
  triggerRef.current = null;
  click(outside);
  assert.equal(dismissed, 3);
  containerRef.current = null;
  click(outside);
  assert.equal(dismissed, 3);

  cleanup();
  click(outside);
  key("Escape");
  assert.equal(dismissed, 3);
});
