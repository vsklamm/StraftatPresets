import assert from "node:assert/strict";
import test from "node:test";
import { halloweenRenderBudget } from "../src/seasonal/halloween/render-budget";
import { createGlandBurst } from "../src/seasonal/halloween/burst";

test("a detonation starts at full brightness on its first rendered frame and shakes once", () => {
  let detonations = 0;
  const sample = createGlandBurst(() => { detonations++; });
  assert.equal(sample(true, 9.08), 0);
  // Even when a slow frame crosses the fuse deadline, the initial flash is not skipped.
  assert.equal(sample(false, 9.15), 1);
  assert.equal(detonations, 1);
  assert.ok(sample(false, 9.25) > .4);
  assert.ok(sample(false, 9.25) < .42);
  assert.equal(sample(false, 9.66), 0);
  assert.equal(sample(false, 9.9), 0);
  assert.equal(detonations, 1);
  assert.equal(sample(true, 10), 0);
  assert.equal(sample(false, 19.12), 1);
  assert.equal(detonations, 2);
});

test("rendering caps Retina and large screens, and scales down on phones", () => {
  const desktop = halloweenRenderBudget(1920, 1080, 2, 8);
  assert.equal(desktop.count, 12);
  assert.ok(1920 * 1080 * desktop.pixelRatio ** 2 <= 900_001);
  const mobile = halloweenRenderBudget(390, 844, 3, 4);
  assert.equal(mobile.count, 6);
  assert.ok(mobile.pixelRatio <= 1.25);
  assert.equal(halloweenRenderBudget(1920, 1080, 1, 2).count, 6);
});

test("ambient mode caps pumpkins at two on desktops and one on phones or fewer cores", () => {
  assert.equal(halloweenRenderBudget(1920, 1080, 2, 8).ambientCount, 2);
  assert.equal(halloweenRenderBudget(390, 844, 3, 8).ambientCount, 1);
  assert.equal(halloweenRenderBudget(1920, 1080, 1, 4).ambientCount, 1);
});

test("the shipped pumpkin is a small self-contained glTF with no texture or decoder downloads", async () => {
  const { readFile } = await import("node:fs/promises");
  const file = await readFile(new URL("../public/halloween/gland-pumpkin.glb", import.meta.url));
  const bytes = new Uint8Array(file);
  const header = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  assert.equal(decoder.decode(bytes.subarray(0, 4)), "glTF");
  assert.equal(header.getUint32(4, true), 2);
  assert.equal(header.getUint32(8, true), file.length);
  assert.ok(file.length < 250_000);
  const model = JSON.parse(decoder.decode(bytes.subarray(20, 20 + header.getUint32(12, true))));
  assert.equal(model.meshes.length, 6, "body, pin, Aboubi facial relief, sockets, eyelids, ivory eyes and teeth");
  assert.equal(model.textures?.length ?? 0, 0);
  assert.ok(model.buffers.every((buffer: { uri?: string }) => !buffer.uri));
  assert.ok(!(model.extensionsRequired ?? []).some((extension: string) => /draco|meshopt/i.test(extension)));
});
