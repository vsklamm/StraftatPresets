import assert from "node:assert/strict";
import test from "node:test";
import {
  gameCatalog,
  getWeaponImage,
  isSupportedMap,
  resolveWeapon,
  resolveWeaponName,
  getWeaponGameId,
  getWeaponDisplayName,
  getMapWeapons,
  expandMapPattern,
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

test("bidirectional Game ID translation and aliases work correctly", () => {
  // Display Name -> Game ID
  assert.equal(getWeaponGameId("Serac"), "Nugget");
  assert.equal(getWeaponGameId("Oklahoma"), "BigFattyBro");
  assert.equal(getWeaponGameId("Pistol"), "Gun");
  assert.equal(getWeaponGameId("AK"), "AK-K");
  assert.equal(getWeaponGameId("Katana"), "Katana");
  assert.equal(getWeaponGameId("Hand Cannon"), "HandCanon");
  assert.equal(getWeaponGameId("God Sword"), "DF_GodSword");

  // Game ID -> Display Name
  assert.equal(getWeaponDisplayName("Nugget"), "Serac");
  assert.equal(getWeaponDisplayName("BigFattyBro"), "Oklahoma");
  assert.equal(getWeaponDisplayName("Gun"), "Pistol");
  assert.equal(getWeaponDisplayName("AK-K"), "AK");
  assert.equal(getWeaponDisplayName("HandCanon"), "Hand Cannon");
  assert.equal(getWeaponDisplayName("DF_GodSword"), "God Sword");
  assert.equal(getWeaponDisplayName("DF_Torrent"), "Torrent");

  // Aliases
  assert.equal(resolveWeapon("The Katana")?.name, "Katana");
  assert.equal(resolveWeapon("Hand Canon")?.name, "Hand Cannon");
  assert.equal(resolveWeapon("Javal Mahmaerd")?.name, "Jahval Mahmaerd");
  assert.equal(resolveWeapon("GodSword")?.name, "God Sword");
  assert.equal(resolveWeapon("Flashlight")?.name, "Flash Light");
  assert.equal(resolveWeapon("AAA-12")?.name, "AAA12");
  assert.equal(resolveWeapon("Hill H15")?.name, "Hill_H15");
  assert.equal(resolveWeapon("HK Caws")?.name, "HK_Caws");
  assert.equal(resolveWeapon("HK G11")?.name, "HK_G11");
  assert.equal(resolveWeapon("MAC10")?.name, "Mac10");
  assert.equal(resolveWeapon("Bublee")?.name, "Bublee");
  assert.equal(resolveWeapon("Bukanee")?.name, "Bukanee");
});

test("map spawners and pattern expansion work safely", () => {
  // Map spawners
  const adobe00Weapons = getMapWeapons("Adobe_00");
  assert.ok(adobe00Weapons.includes("AK"));
  assert.ok(adobe00Weapons.includes("AP Mine"));
  assert.ok(adobe00Weapons.includes("Glock"));
  assert.ok(adobe00Weapons.includes("Havoc"));

  // Safe pattern expansion
  const adobeMaps = expandMapPattern("Adobe_*");
  assert.ok(adobeMaps.includes("Adobe_00"));
  assert.ok(adobeMaps.includes("Adobe_00_Alt"));
  assert.ok(adobeMaps.includes("Adobe_01"));

  // Regex special characters escaping test (does not treat dot as wildcard)
  const exactMatch = expandMapPattern("Adobe.00");
  assert.equal(exactMatch.length, 0); // Dot is treated as literal dot, which no map contains
});
