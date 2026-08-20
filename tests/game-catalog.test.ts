import assert from "node:assert/strict";
import test from "node:test";
import {
  gameCatalog,
  getWeaponImage,
  isSupportedMap,
  resolveWeaponName,
  supportedGameRelease,
  supportedMapCount,
  supportedWeaponCount,
  validatePresetGameData,
  weaponAssetUrl,
} from "../src/domain/game-catalog";

test("the reviewed catalog represents STRAFTAT 1.4.8", () => {
  assert.equal(supportedGameRelease.version, "1.4.8");
  assert.equal(supportedWeaponCount, 72);
  assert.equal(supportedMapCount, 369);
  assert.equal(isSupportedMap("Arena_00"), true);
  assert.equal(isSupportedMap("arena_00"), false);
});

test("excluded environmental and novelty items are absent", () => {
  const names = new Set(gameCatalog.weapons.map((weapon) => weapon.name.toLowerCase()));
  for (const name of ["aboubi's head", "barrel", "cochin", "tube gun", "vehicles"]) assert.equal(names.has(name), false);
});

test("weapon input resolves canonical spelling case-insensitively", () => {
  assert.equal(resolveWeaponName(" gland   grenade "), "Gland Grenade");
  assert.equal(getWeaponImage("GLAND GRENADE"), weaponAssetUrl("/weapons/gland-grenade.webp"));
  assert.equal(resolveWeaponName("Barrel"), null);
});

test("shared preset validation canonicalizes weapons and rejects unknown game data", () => {
  assert.deepEqual(validatePresetGameData({ mapNames: ["Arena_00"], randomizedWeapons: [{ name: "ak", weight: 10 }] }), {
    valid: true,
    errors: [],
    canonicalWeapons: [{ name: "AK", weight: 10 }],
  });
  const invalid = validatePresetGameData({ mapNames: ["Definitely_Not_A_Map"], randomizedWeapons: [{ name: "Barrel", weight: 0 }] });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors, ["Unknown map: Definitely_Not_A_Map", "Unknown weapon: Barrel"]);
});
