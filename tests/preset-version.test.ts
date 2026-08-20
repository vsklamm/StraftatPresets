import assert from "node:assert/strict";
import test from "node:test";
import {
  comparePresetVersions,
  formatPresetVersionLabel,
  isPresetVersionInRange,
  isPresetVersionInputCandidate,
  nextPresetVersionLabel,
  parsePresetVersion,
  sortPresetVersionsNewestFirst,
} from "../src/domain/preset-version";
import {
  createPresetVersionFromPrevious,
  findPreviousPresetVersion,
} from "../src/domain/preset-content";

test("preset versions require a complete semantic label", () => {
  assert.deepEqual(parsePresetVersion("v2.5.0"), [2, 5, 0]);
  assert.deepEqual(parsePresetVersion("2.5"), [2, 5, 0]);
  for (const invalid of ["v02.5.0", "v0.0.0", "v100.0.1", "version 2"]) {
    assert.equal(isPresetVersionInRange(invalid), false);
  }
  assert.equal(isPresetVersionInRange("v0.0.1"), true);
  assert.equal(isPresetVersionInRange("v100.0.0"), true);
  assert.ok(comparePresetVersions(parsePresetVersion("v2.5.0")!, parsePresetVersion("v2.4.9")!) > 0);
});

test("new presets start at v1.0 and new versions step by v0.1", () => {
  assert.equal(nextPresetVersionLabel([]), "v1.0.0");
  assert.equal(nextPresetVersionLabel(["v2.4.0", "v2.3.7"]), "v2.5.0");
  assert.equal(nextPresetVersionLabel(["v100.0.0"]), null);
});

test("version labels hide only an empty patch in cards", () => {
  assert.equal(formatPresetVersionLabel("v2.5.0"), "v2.5");
  assert.equal(formatPresetVersionLabel("v2.5.3"), "v2.5.3");
  assert.equal(formatPresetVersionLabel("wrong"), "wrong");
});

test("preset versions are sorted semantically with the latest first", () => {
  const sorted = sortPresetVersionsNewestFirst([
    { label: "v2.9.4" },
    { label: "v10.0.0" },
    { label: "unfinished" },
    { label: "v2.10.0" },
  ]);
  assert.deepEqual(sorted.map((version) => version.label), ["v10.0.0", "v2.10.0", "v2.9.4", "unfinished"]);
});

test("the editor accepts only version-shaped input while typing", () => {
  for (const value of ["", "v", "v2", "v2.", "v2.5", "v2.5.", "v2.5.1", "2", "2.5", "2.5.1"]) assert.equal(isPresetVersionInputCandidate(value), true);
  for (const value of ["2.5.1.4", "version 2", "v2..1", "V2.5.1", "v2.5-beta"]) assert.equal(isPresetVersionInputCandidate(value), false);
});

test("previous version discovery finds the closest lower semantic version", () => {
  const versions = [
    { label: "v1.0.0" },
    { label: "v1.2.0" },
    { label: "v2.0.0" },
  ];
  assert.equal(findPreviousPresetVersion("v1.3.0", versions)?.label, "v1.2.0");
  assert.equal(findPreviousPresetVersion("v1.1.0", versions)?.label, "v1.0.0");
  assert.equal(findPreviousPresetVersion("v3.0.0", versions)?.label, "v2.0.0");
  assert.equal(findPreviousPresetVersion("v0.9.0", versions), undefined);
});

test("createPresetVersionFromPrevious copies weapons and empty sections", () => {
  const prevWithWeapons = {
    label: "v1.0.0",
    mapPlaylists: [
      { name: "Dust II", description: "Classic", encodedValue: "abc", mapNames: ["Dust"] },
      { name: "Inferno", description: "Banana", encodedValue: "def", mapNames: ["Inferno"] },
    ],
    weaponConfigurations: [
      {
        kind: "randomized" as const,
        name: "Randomized weapons",
        weapons: [
          { name: "Pistol", weight: 100 },
          { name: "Rifle", weight: 50 },
        ],
      },
    ],
  };

  const next1 = createPresetVersionFromPrevious("v1.1.0", prevWithWeapons);
  assert.equal(next1.label, "v1.1.0");
  assert.equal(next1.mapPlaylists.length, 2);
  assert.equal(next1.mapPlaylists[0].name, "");
  assert.equal(next1.mapPlaylists[0].encodedValue, "");
  assert.equal(next1.weaponConfigurations.length, 1);
  assert.equal(next1.weaponConfigurations[0].kind, "randomized");
  if (next1.weaponConfigurations[0].kind === "randomized") {
    assert.deepEqual(next1.weaponConfigurations[0].weapons, [
      { name: "Pistol", weight: 100 },
      { name: "Rifle", weight: 50 },
    ]);
  }

  const prevWithSwapper = {
    label: "v1.1.0",
    mapPlaylists: [
      { name: "Mirage", description: "", encodedValue: "xyz", mapNames: ["Mirage"] },
    ],
    weaponConfigurations: [
      { kind: "swapper" as const, name: "Swapper A", encodedValue: "s1" },
      { kind: "swapper" as const, name: "Swapper B", encodedValue: "s2" },
    ],
  };

  const next2 = createPresetVersionFromPrevious("v1.2.0", prevWithSwapper);
  assert.equal(next2.mapPlaylists.length, 1);
  assert.equal(next2.weaponConfigurations.length, 2);
  assert.equal(next2.weaponConfigurations[0].kind, "swapper");
  assert.equal(next2.weaponConfigurations[0].name, "");
  assert.equal(next2.weaponConfigurations[0].encodedValue, "");
  assert.equal(next2.weaponConfigurations[1].kind, "swapper");
  assert.equal(next2.weaponConfigurations[1].name, "");
  assert.equal(next2.weaponConfigurations[1].encodedValue, "");
});
