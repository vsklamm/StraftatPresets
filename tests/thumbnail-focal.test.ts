import assert from "node:assert/strict";
import test from "node:test";
import { detectOptimalThumbnailFocalPoint } from "../src/lib/client-image-optimization";

function createMockImageData(
  width: number,
  height: number,
  drawShape?: (x: number, y: number) => number // returns brightness 0-255
): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const b = drawShape ? drawShape(x, y) : 128;
      data[idx] = b;     // R
      data[idx + 1] = b; // G
      data[idx + 2] = b; // B
      data[idx + 3] = 255;
    }
  }
  return { data, width, height };
}

test("detectOptimalThumbnailFocalPoint defaults to center for uniform or low-contrast images", () => {
  const uniform = createMockImageData(160, 90, () => 80);
  const focal = detectOptimalThumbnailFocalPoint(uniform);
  assert.equal(focal.x, 50);
  assert.equal(focal.y, 50);
});

test("detectOptimalThumbnailFocalPoint shifts left when main subject is on the left", () => {
  // Draw high contrast box on left: x between 10 and 40 (width is 160)
  const leftHeavy = createMockImageData(160, 90, (x, y) => {
    if (x >= 15 && x <= 45 && y >= 25 && y <= 65) {
      return (x + y) % 2 === 0 ? 240 : 20; // high contrast checkerboard
    }
    return 100; // flat background
  });

  const focal = detectOptimalThumbnailFocalPoint(leftHeavy);
  assert.ok(focal.x <= 35, `Expected focal.x <= 35 for left subject, got ${focal.x}`);
  assert.equal(focal.y, 50);
});

test("detectOptimalThumbnailFocalPoint shifts right when main subject is on the right", () => {
  // Draw high contrast box on right: x between 115 and 145 (width is 160)
  const rightHeavy = createMockImageData(160, 90, (x, y) => {
    if (x >= 115 && x <= 145 && y >= 25 && y <= 65) {
      return (x + y) % 2 === 0 ? 240 : 20; // high contrast checkerboard
    }
    return 100; // flat background
  });

  const focal = detectOptimalThumbnailFocalPoint(rightHeavy);
  assert.ok(focal.x >= 65, `Expected focal.x >= 65 for right subject, got ${focal.x}`);
  assert.equal(focal.y, 50);
});

test("detectOptimalThumbnailFocalPoint consistently chooses a side for two separated subjects", () => {
  const dualHeavy = createMockImageData(160, 90, (x, y) => {
    if ((x >= 15 && x <= 40 && y >= 25 && y <= 65) || (x >= 120 && x <= 145 && y >= 25 && y <= 65)) {
      return (x + y) % 2 === 0 ? 250 : 10;
    }
    return 80;
  });

  const focal = detectOptimalThumbnailFocalPoint(dualHeavy);
  assert.ok(focal.x <= 32 || focal.x >= 68);
  assert.equal(focal.y, 50);
  for (let i = 0; i < 8; i++) assert.deepEqual(detectOptimalThumbnailFocalPoint(dualHeavy), focal);
});

test("detectOptimalThumbnailFocalPoint consistently chooses the stronger of two subjects", () => {
  for (const strongerSide of ["left", "right"] as const) {
    const image = createMockImageData(160, 90, (x, y) => {
      const left = x >= 15 && x <= 40 && y >= 25 && y <= 65;
      const right = x >= 120 && x <= 145 && y >= 25 && y <= 65;
      if (!left && !right) return 80;
      const strong = strongerSide === "left" ? left : right;
      return (x + y) % 2 === 0 ? (strong ? 250 : 190) : (strong ? 10 : 70);
    });
    for (let i = 0; i < 8; i++) {
      const focal = detectOptimalThumbnailFocalPoint(image);
      assert.ok(strongerSide === "left" ? focal.x <= 32 : focal.x >= 68);
      assert.equal(focal.y, 50);
    }
  }
});

test("detectOptimalThumbnailFocalPoint chooses the stronger side even for a small imbalance", () => {
  const image = createMockImageData(160, 90, (x, y) => {
    if (y < 25 || y > 65) return 80;
    if (x >= 15 && x <= 40) return (x + y) % 2 === 0 ? 250 : 10;
    if (x >= 120 && x <= 145) return (x + y) % 2 === 0 ? 240 : 20;
    return 80;
  });
  const focal = detectOptimalThumbnailFocalPoint(image);
  assert.ok(focal.x <= 32);
  assert.equal(focal.y, 50);
});

test("detectOptimalThumbnailFocalPoint preserves a strong centered subject despite detailed edges", () => {
  const image = createMockImageData(160, 90, (x, y) => {
    if (y < 15 || y > 75) return 100;
    if (x >= 60 && x <= 100) return (x + y) % 2 === 0 ? 250 : 10;
    if (x <= 40 || x >= 120) return (x + y) % 2 === 0 ? 160 : 60;
    return 100;
  });
  assert.deepEqual(detectOptimalThumbnailFocalPoint(image), { x: 50, y: 50 });
});
