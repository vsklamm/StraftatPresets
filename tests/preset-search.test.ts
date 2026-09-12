import assert from "node:assert/strict";
import test from "node:test";
import { encodeCompressedJson } from "../src/domain/base64-decode";
import type { PresetRevisionContent } from "../src/domain/preset-content";
import {
  buildFtsMatch,
  buildPresetSearchProjection,
  resolveSearchEntities,
  splitSearchQuery,
} from "../src/domain/preset-search";

test("search projection indexes content from the latest version only and only swapper results", async () => {
  const swapper = await encodeCompressedJson({
    type: "swap",
    Preset: {
      Name: "Close range replacements",
      Maps: [{ MapString: "Adobe_00", WeaponRemaps: [{ Precursor: "Gun", Result: "AK-K" }] }],
    },
  });
  const content: PresetRevisionContent = {
    title: "<#ff0000>Game of Mines",
    description: "Carefully picked maps.",
    thumbnailKey: null,
    tags: ["mines"],
    versioningEnabled: true,
    versions: [
      {
        label: "v1.0.0",
        mapPlaylists: [{ name: "Old maps", description: "The first set", encodedValue: "", mapNames: ["Adobe_00"] }],
        weaponConfigurations: [
          { kind: "randomized", name: "Randomizer Settings", weapons: [{ name: "Taser", weight: 1 }] },
          { kind: "swapper", name: "Close range replacements", description: "Pistol becomes AK", encodedValue: swapper },
        ],
      },
      {
        label: "v2.0.0",
        mapPlaylists: [{ name: "Current maps", description: "The current set", encodedValue: "", mapNames: ["Adobe_01"] }],
        weaponConfigurations: [{ kind: "randomized", name: "Randomizer Settings", weapons: [{ name: "AP Mine", weight: 100 }] }],
      },
    ],
  };

  const projection = await buildPresetSearchProjection(content, "klammvs");
  assert.equal(projection.document.title, "Game of Mines");
  assert.equal(projection.document.secondaryText, "Current maps The current set");
  assert.deepEqual(projection.terms, [
    { field: "map", value: "Adobe_01" },
    { field: "randomized_weapon", value: "APMine" },
  ]);
  assert.equal(projection.terms.some((term) => term.value === "Taser"), false);
  assert.equal(projection.terms.some((term) => term.value === "Gun"), false);
  assert.equal(projection.terms.some((term) => term.value === "AK-K"), false);
});

test("search projection indexes swapper targets from the latest version, not source weapons", async () => {
  const swapper = await encodeCompressedJson({
    type: "swap",
    Preset: {
      Name: "Close range replacements",
      Maps: [{ MapString: "Adobe_00", WeaponRemaps: [{ Precursor: "Gun", Result: "AK-K" }] }],
    },
  });
  const content: PresetRevisionContent = {
    title: "Swapped",
    description: "Current swaps.",
    thumbnailKey: null,
    tags: ["close-range"],
    versioningEnabled: true,
    versions: [
      { label: "v1.0.0", mapPlaylists: [], weaponConfigurations: [] },
      {
        label: "v2.0.0",
        mapPlaylists: [],
        weaponConfigurations: [
          { kind: "swapper", name: "Close range replacements", description: "Pistol becomes AK", encodedValue: swapper },
        ],
      },
    ],
  };

  const projection = await buildPresetSearchProjection(content, "klammvs");
  assert.equal(projection.document.secondaryText, "Close range replacements Pistol becomes AK");
  assert.deepEqual(projection.terms, [{ field: "swapper_result", value: "AK-K" }]);
  assert.equal(projection.terms.some((term) => term.value === "Gun"), false);
});

test("catalog entity resolution tolerates small weapon and map typos without guessing short names", () => {
  assert.deepEqual(resolveSearchEntities("claymor").weaponGameIds, ["Claymore"]);
  assert.deepEqual(resolveSearchEntities("Adboe_00").mapNames, ["Adobe_00"]);
  assert.deepEqual(resolveSearchEntities("AR").weaponGameIds, ["AR15"]);
  assert.deepEqual(resolveSearchEntities("AS").weaponGameIds, []);
});

test("search query parsing is bounded and FTS input is escaped into field queries", () => {
  assert.deepEqual(splitSearchQuery(" mines, claymore, , Adobe_00 "), ["mines", "claymore", "Adobe_00"]);
  assert.equal(buildFtsMatch("Game of Mines", "title"), 'title : ("game"* AND "of"* AND "mines"*)');
});
