import { describe, it } from "node:test";
import assert from "node:assert";

// Minimal replication of StraftatFX gradient logic (mode 5: per-character color)
function hexToRgb(hex: string) {
  const bigint = parseInt(hex.replace(/^#/, ""), 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
}

function interpolateColor(color1: {r: number, g: number, b: number}, color2: {r: number, g: number, b: number}, factor: number) {
  return {
    r: Math.round(color1.r + factor * (color2.r - color1.r)),
    g: Math.round(color1.g + factor * (color2.g - color1.g)),
    b: Math.round(color1.b + factor * (color2.b - color1.b))
  };
}

function generateColoredText(text: string, colors: string[]) {
  const chars = [...text];
  const vis = chars.filter(c => c !== " ");
  const steps = vis.length;

  let out = "";
  let last = null;
  let vi = 0;

  for (const ch of chars) {
    if (ch === " ") {
      out += " ";
      continue;
    }

    let hex;
    if (colors.length >= steps) {
      hex = colors[Math.min(vi, steps - 1)];
    } else {
      const f = steps <= 1 ? 0 : vi / (steps - 1);
      const scaled = f * (colors.length - 1);
      const leftIndex = Math.floor(scaled);
      const rightIndex = Math.min(leftIndex + 1, colors.length - 1);
      const localT = scaled - leftIndex;

      if (leftIndex === rightIndex || localT === 0) {
        hex = colors[leftIndex];
      } else {
        const left = hexToRgb(colors[leftIndex]);
        const right = hexToRgb(colors[rightIndex]);
        const col = interpolateColor(left, right, localT);
        hex = rgbToHex(col.r, col.g, col.b);
      }
    }

    if (hex !== last) {
      out += `<${hex}>`;
      last = hex;
    }

    out += ch;
    vi++;
  }

  return out;
}

describe("StraftatFX Coloring Simulation", () => {
  it("should calculate sizes for differently sized texts with unique colors per letter", () => {
    const lengths = [90, 100, 200, 500, 1000];
    const colors = ["#000000", "#FFFFFF"]; // Gradient from black to white

    for (const len of lengths) {
      const baseText = "A".repeat(len);
      const coloredText = generateColoredText(baseText, colors);

      console.log(`\n--- Base Length: ${len} ---`);
      console.log(`Resulting colored string length: ${coloredText.length}`);
      console.log(`Max possible size (10 chars per letter): ${len * 10}`);
      console.log(`Expansion factor: ${(coloredText.length / len).toFixed(2)}x`);

      // We know maximum characters each letter can add is 9 (<#RRGGBB>) + 1 (the letter itself) = 10.
      assert.ok(coloredText.length <= len * 10);
    }
  });

  it("should generate actual colored strings for visual inspection in tests", () => {
    const text90 = "A".repeat(90);
    const colored90 = generateColoredText(text90, ["#FF0000", "#00FF00", "#0000FF"]);
    console.log("\n--- Sample of a 90 letter colored text (3-color gradient) ---");
    console.log(`Length: ${colored90.length}`);
    console.log(`Content:\n${colored90}\n`);

    assert.ok(colored90.length > 90);
  });
});
