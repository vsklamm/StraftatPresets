import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const { removeFlatBackground } = await import(new URL("../scripts/update-game-catalog.mjs", import.meta.url).href);

test("weapon background removal preserves thin, low-contrast parts at small sizes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "weapon-background-"));
  try {
    const width = 64;
    const pixels = Buffer.alloc(width * width * 3, 49);
    for (let y = 24; y < 40; y++) {
      for (let x = 12; x < 40; x++) pixels.fill(120, (y * width + x) * 3, (y * width + x + 1) * 3);
    }
    for (let y = 30; y < 33; y++) {
      for (let x = 40; x < 56; x++) pixels.fill(73, (y * width + x) * 3, (y * width + x + 1) * 3);
    }
    const source = path.join(directory, "source.png");
    const output = path.join(directory, "cutout.webp");
    await sharp(pixels, { raw: { width, height: width, channels: 3 } }).png().toFile(source);
    await removeFlatBackground(source, output);
    const data = await sharp(output).ensureAlpha().raw().toBuffer();
    const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];
    assert.equal(alphaAt(0, 0), 0, "outer background remains transparent");
    assert.equal(alphaAt(25, 31), 255, "weapon body remains opaque");
    assert.equal(alphaAt(48, 31), 255, "thin barrel keeps an opaque center");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
