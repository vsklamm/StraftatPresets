import assert from "node:assert/strict";
import test from "node:test";
import { encodeCompressedJson } from "../src/domain/base64-decode";
import {
  aggregateSwapperResultWeapons,
  decodeSwapperResultWeapons,
  MAX_SWAPPER_RESULT_WEAPONS,
} from "../src/domain/swapper-result-weapons";
import type { DecodedSwapper } from "../src/domain/swapper-export";

function decoded(results: string[]): DecodedSwapper {
  return {
    name: "Swapper",
    remapCount: results.length,
    rules: [{
      mapString: "Adobe_00",
      remaps: results.map((result, index) => ({ precursor: `Source ${index}`, result })),
    }],
    invalidMaps: [],
    invalidWeapons: [],
  };
}

test("aggregates canonical Swapper result weapons by total remap count", () => {
  const weapons = aggregateSwapperResultWeapons([
    decoded(["AK", "Katana", "None", "AK-K"]),
    decoded(["AK-K", "Katana", "Unknown weapon"]),
  ]);

  assert.deepEqual(weapons, [
    { name: "AK", weight: 3 },
    { name: "Katana", weight: 2 },
  ]);
});

test("orders equal counts consistently and limits the preview to the top 15 weapons", () => {
  const results = Array.from({ length: MAX_SWAPPER_RESULT_WEAPONS + 3 }, (_, index) =>
    index === 0 ? "AK" : index === 1 ? "AK-K" : [
      "AAA12", "AP Mine", "AR", "Baseball Bat", "Bayshore", "Beam Load", "Bender", "Blank State",
      "Blister", "Bublee", "Bukanee", "Claymore", "Couperet", "Crisis", "Curved Knife", "Cyst",
    ][index - 2],
  );

  const weapons = aggregateSwapperResultWeapons([decoded(results)]);

  assert.equal(weapons.length, MAX_SWAPPER_RESULT_WEAPONS);
  assert.deepEqual(weapons[0], { name: "AK", weight: 2 });
  assert.equal(weapons.some((weapon) => weapon.name === "Unknown weapon"), false);
  assert.deepEqual(weapons.slice(1), [...weapons.slice(1)].sort((left, right) => left.name.localeCompare(right.name)));
});

test("decodes every Swapper and keeps valid results when one draft payload is invalid", async () => {
  const first = await encodeCompressedJson({
    type: "swap",
    Preset: {
      Name: "First",
      Maps: [{ MapString: "Adobe_00", WeaponRemaps: [{ Precursor: "Gun", Result: "AK-K" }] }],
    },
  });
  const second = await encodeCompressedJson({
    type: "swap",
    Preset: {
      Name: "Second",
      Maps: [{ MapString: "Arena_00", WeaponRemaps: [{ Precursor: "Nugget", Result: "AK-K" }] }],
    },
  });

  assert.deepEqual(await decodeSwapperResultWeapons([first, "invalid", second]), [
    { name: "AK", weight: 2 },
  ]);
});
