import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSwapperPresetJson,
  decodeSwapperExport,
} from "../src/domain/swapper-export";
import { encodeCompressedJson } from "../src/domain/base64-decode";

test("buildSwapperPresetJson translates display names to Game IDs and removes no-ops", () => {
  const rules = [
    {
      mapString: "Adobe_00",
      swaps: [
        { precursor: "Serac", result: "Katana" },      // Serac -> Nugget, Katana -> Katana
        { precursor: "Oklahoma", result: "Oklahoma" },  // No-op swap, should be removed
        { precursor: "Pistol", result: "AK" },          // Gun -> AK-K
      ],
    },
  ];

  const json = buildSwapperPresetJson("Test Swapper", rules);
  assert.equal(json.type, "swap");
  assert.equal(json.Preset.Name, "Test Swapper");
  assert.equal(json.Preset.Maps.length, 1);
  assert.equal(json.Preset.Maps[0].MapString, "Adobe_00");

  const remaps = json.Preset.Maps[0].WeaponRemaps;
  assert.equal(remaps.length, 2); // No-op was removed
  assert.deepEqual(remaps[0], { Precursor: "Nugget", Result: "Katana" });
  assert.deepEqual(remaps[1], { Precursor: "Gun", Result: "AK-K" });
});

test("buildSwapperPresetJson merges duplicate map rules", () => {
  const rules = [
    {
      mapString: "Adobe_00",
      swaps: [{ precursor: "Serac", result: "Katana" }],
    },
    {
      mapString: "Adobe_00",
      swaps: [{ precursor: "Pistol", result: "AK" }],
    },
  ];

  const json = buildSwapperPresetJson("Merged Swapper", rules);
  assert.equal(json.Preset.Maps.length, 1);
  assert.equal(json.Preset.Maps[0].WeaponRemaps.length, 2);
});

test("decodeSwapperExport translates Game IDs back to canonical display names", async () => {
  const payload = {
    type: "swap",
    Preset: {
      Name: "Imported Swapper",
      Maps: [
        {
          MapString: "Adobe_00",
          WeaponRemaps: [
            { Precursor: "Nugget", Result: "BigFattyBro" },
            { Precursor: "Gun", Result: "DF_GodSword" },
          ],
        },
      ],
    },
  };

  const encoded = await encodeCompressedJson(payload);
  const decoded = await decodeSwapperExport(encoded);

  assert.equal(decoded.name, "Imported Swapper");
  assert.equal(decoded.remapCount, 2);
  assert.equal(decoded.rules.length, 1);
  assert.equal(decoded.rules[0].mapString, "Adobe_00");
  assert.equal(decoded.invalidMaps.length, 0);
  assert.equal(decoded.invalidWeapons.length, 0);

  assert.deepEqual(decoded.rules[0].remaps[0], {
    precursor: "Serac",
    result: "Oklahoma",
  });
  assert.deepEqual(decoded.rules[0].remaps[1], {
    precursor: "Pistol",
    result: "God Sword",
  });
});

test("decodeSwapperExport supports wildcard map patterns and flags unknown maps/weapons", async () => {
  const payload = {
    type: "swap",
    Preset: {
      Name: "Wildcard Swapper",
      Maps: [
        {
          MapString: "Adobe_*", // Wildcard pattern matching official maps
          WeaponRemaps: [
            { Precursor: "Serac", Result: "Katana" },
          ],
        },
        {
          MapString: "NonExistentMap_999", // Invalid map
          WeaponRemaps: [
            { Precursor: "FakeGun123", Result: "Pistol" }, // Invalid weapon
          ],
        },
      ],
    },
  };

  const encoded = await encodeCompressedJson(payload);
  const decoded = await decodeSwapperExport(encoded);

  assert.equal(decoded.name, "Wildcard Swapper");
  assert.deepEqual(decoded.invalidMaps, ["NonExistentMap_999"]);
  assert.deepEqual(decoded.invalidWeapons, ["FakeGun123"]);
});

test("decodeSwapperExport accepts empty or None result remaps representing weapon removal", async () => {
  const payload = {
    type: "swap",
    Preset: {
      Name: "Spawn Removal Preset",
      Maps: [
        {
          MapString: "Arena_Shadow_05_Alt",
          WeaponRemaps: [
            { Precursor: "Repulsar", Result: "" },
            { Precursor: "ProximityMine", Result: "None" },
            { Precursor: "Claymore", Result: "AR15" },
          ],
        },
      ],
    },
  };

  const encoded = await encodeCompressedJson(payload);
  const decoded = await decodeSwapperExport(encoded);

  assert.equal(decoded.name, "Spawn Removal Preset");
  assert.equal(decoded.remapCount, 3);
  assert.deepEqual(decoded.rules[0].remaps[0], { precursor: "Repulsar", result: "None" });
  assert.deepEqual(decoded.rules[0].remaps[1], { precursor: "Proximity Mine", result: "None" });
  assert.deepEqual(decoded.rules[0].remaps[2], { precursor: "Claymore", result: "AR-15" });
  assert.deepEqual(decoded.invalidWeapons, []);
});
