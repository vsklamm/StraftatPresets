import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWeaponChances,
  calculateRelativeWeaponBarWidth,
  clampWeaponWeight,
  formatWeaponPercent,
  roundChancePercent,
  MIN_WEAPON_WEIGHT,
  MAX_WEAPON_WEIGHT,
} from "../src/domain/weapon-weights";
import { parsePresetRevisionContent } from "../src/domain/preset-content";
import { validatePresetRevision, type PresetRevisionContent } from "../src/domain/preset-workflow";

test("weapon weight constants enforce min 1 and max 100", () => {
  assert.equal(MIN_WEAPON_WEIGHT, 1);
  assert.equal(MAX_WEAPON_WEIGHT, 100);
});

test("weapon weight input clamps values to the integer range 1 through 100", () => {
  assert.equal(clampWeaponWeight(Number("")), MIN_WEAPON_WEIGHT);
  assert.equal(clampWeaponWeight(0), MIN_WEAPON_WEIGHT);
  assert.equal(clampWeaponWeight(-5), MIN_WEAPON_WEIGHT);
  assert.equal(clampWeaponWeight(42.8), 42);
  assert.equal(clampWeaponWeight(101), MAX_WEAPON_WEIGHT);
});

test("weapon chances are derived from weights", () => {
  const weapons = calculateWeaponChances([
    { name: "Claymore", weight: 100 },
    { name: "Taser", weight: 25 },
  ]);

  assert.equal(weapons[0].percent, 80);
  assert.equal(weapons[1].percent, 20);
});

test("negative and empty weights do not produce invalid chances", () => {
  const weapons = calculateWeaponChances([
    { name: "Claymore", weight: -10 },
    { name: "Taser", weight: 0 },
  ]);

  assert.deepEqual(weapons.map((weapon) => weapon.percent), [0, 0]);
});

test("chance bars preserve weapon ratios relative to the strongest weapon", () => {
  assert.equal(calculateRelativeWeaponBarWidth(100, 100), 100);
  assert.equal(calculateRelativeWeaponBarWidth(25, 100), 25);
  assert.equal(calculateRelativeWeaponBarWidth(5, 5), 100);
  assert.equal(calculateRelativeWeaponBarWidth(0, 100), 0);
});

test("calculates and independently rounds weapon percentages matching Straftat's exact output", () => {
  const straftatWeapons = [
    { name: "AP mine", weight: 100 },
    { name: "Claymore", weight: 100 },
    { name: "Dual launcher", weight: 1 },
    { name: "Flashlight", weight: 8 },
    { name: "Gland grenade", weight: 5 },
    { name: "Hand grenade", weight: 55 },
    { name: "Impetus", weight: 2 },
    { name: "Proximity mine", weight: 81 },
    { name: "Repulsar", weight: 5 },
    { name: "Stun grenade", weight: 68 },
    { name: "Stun mine", weight: 16 },
    { name: "Taser", weight: 2 },
  ];

  const results = calculateWeaponChances(straftatWeapons);
  assert.deepEqual(
    results.map((w) => `${w.name} - ${w.weight} (${formatWeaponPercent(w.percent)})`),
    [
      "AP mine - 100 (22.6%)",
      "Claymore - 100 (22.6%)",
      "Dual launcher - 1 (0.2%)",
      "Flashlight - 8 (1.8%)",
      "Gland grenade - 5 (1.1%)",
      "Hand grenade - 55 (12.4%)",
      "Impetus - 2 (0.5%)",
      "Proximity mine - 81 (18.3%)",
      "Repulsar - 5 (1.1%)",
      "Stun grenade - 68 (15.3%)",
      "Stun mine - 16 (3.6%)",
      "Taser - 2 (0.5%)",
    ]
  );
});

test("roundChancePercent independently rounds to 1 decimal place without forcing 100% total", () => {
  const thirdWeapons = [
    { name: "W1", weight: 1 },
    { name: "W2", weight: 1 },
    { name: "W3", weight: 1 },
  ];
  const results = calculateWeaponChances(thirdWeapons);
  assert.deepEqual(results.map((w) => w.percent), [33.3, 33.3, 33.3]);
  const total = results.reduce((sum, w) => sum + w.percent, 0);
  assert.equal(roundChancePercent(total), 99.9);
});

test("validatePresetRevision rejects duplicate weapons and out-of-range weights", () => {
  const baseContent: PresetRevisionContent = {
    title: "Weapon Test",
    description: "Testing weapon validation and limits across pools.",
    thumbnailKey: null,
    tags: ["lobby", "maps"],
    versioningEnabled: false,
    versions: [{
      label: "v1.0.0",
      mapPlaylists: [{
        name: "Test Playlist",
        description: "Valid description",
        encodedValue: "code",
        mapNames: ["Arena_00"],
      }],
      weaponConfigurations: [{
        kind: "randomized",
        name: "Weapon Pool",
        weapons: [
          { name: "Claymore", weight: 50 },
          { name: "Claymore", weight: 80 }, // Duplicate!
          { name: "Taser", weight: -5 }, // Below MIN_WEAPON_WEIGHT (1)
          { name: "AK", weight: 150 }, // Above MAX_WEAPON_WEIGHT (100)
          { name: "M16", weight: 0 }, // Zero is not a valid randomized weight
          { name: "Revolver", weight: 100 }, // Exactly 100 (Valid MAX)
        ],
      }],
    }],
  };

  const issues = validatePresetRevision(baseContent);
  const duplicateIssues = issues.filter((i) => i.code === "duplicate_weapon");
  const weightIssues = issues.filter((i) => i.code === "invalid_weapon_weight");

  assert.equal(duplicateIssues.length, 1);
  assert.equal(duplicateIssues[0].field, "versions.0.weaponConfigurations.0.weapons.1.name");

  assert.equal(weightIssues.length, 3);
  assert.equal(weightIssues[0].field, "versions.0.weaponConfigurations.0.weapons.2.weight");
  assert.equal(weightIssues[1].field, "versions.0.weaponConfigurations.0.weapons.3.weight");
  assert.equal(weightIssues[2].field, "versions.0.weaponConfigurations.0.weapons.4.weight");
});

test("backend parsing accepts only integer weapon weights from 1 through 100", () => {
  const contentWithWeight = (weight: number) => ({
    title: "Hacked Content",
    description: "Testing parsing defense",
    thumbnailKey: null,
    tags: ["lobby"],
    versions: [{
      label: "v1.0.0",
      mapPlaylists: [{
        name: "Test",
        description: "",
        encodedValue: "code",
        mapNames: ["Arena_00"],
      }],
      weaponConfigurations: [{
        kind: "randomized",
        name: "Hacked Pool",
        weapons: [{ name: "Claymore", weight }],
      }],
    }],
  });

  assert.doesNotThrow(() => parsePresetRevisionContent(contentWithWeight(1)));
  assert.doesNotThrow(() => parsePresetRevisionContent(contentWithWeight(100)));
  for (const invalidWeight of [-1, 0, 1.5, 101]) {
    assert.throws(() => parsePresetRevisionContent(contentWithWeight(invalidWeight)));
  }
});
