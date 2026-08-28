import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import rawCatalog from "../game-data/catalog.json";
import rawMaps from "../game-data/maps.json";
import rawWeaponSources from "../game-data/weapon-sources.json";
import rawWeapons from "../game-data/weapons.json";
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

const normalizedKey = (value: string) => value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");

test("split game data exactly mirrors the reviewed catalog", () => {
  assert.equal(rawWeapons.schemaVersion, rawCatalog.schemaVersion);
  assert.deepEqual(rawWeapons.supportedRelease, rawCatalog.supportedRelease);
  assert.deepEqual(rawWeapons.weapons, rawCatalog.weapons);
  assert.deepEqual(rawMaps, rawCatalog.maps);
  assert.deepEqual(supportedGameRelease, rawCatalog.supportedRelease);
  assert.equal(supportedWeaponCount, rawCatalog.weapons.length);
  assert.equal(supportedMapCount, rawCatalog.maps.length);
  assert.match(supportedGameRelease.version, /^\d+\.\d+\.\d+$/);
  assert.match(supportedGameRelease.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.doesNotThrow(() => new URL(supportedGameRelease.sourceUrl));
});

test("weapon and map identities are unique, canonical, and internally resolvable", () => {
  const weaponNames = new Set<string>();
  const gameIds = new Set<string>();
  const imagePaths = new Set<string>();
  for (const weapon of gameCatalog.weapons) {
    const nameKey = normalizedKey(weapon.name);
    const gameIdKey = normalizedKey(weapon.gameId);
    assert.ok(nameKey && gameIdKey);
    assert.equal(weaponNames.has(nameKey), false, `Duplicate normalized weapon name: ${weapon.name}`);
    assert.equal(gameIds.has(gameIdKey), false, `Duplicate normalized weapon ID: ${weapon.gameId}`);
    assert.equal(imagePaths.has(weapon.image), false, `Duplicate weapon image: ${weapon.image}`);
    weaponNames.add(nameKey);
    gameIds.add(gameIdKey);
    imagePaths.add(weapon.image);
    assert.equal(resolveWeaponName(weapon.name), weapon.name);
    assert.equal(getWeaponGameId(weapon.name), weapon.gameId);
    assert.equal(getWeaponDisplayName(weapon.gameId), weapon.name);
  }

  const mapNames = new Set<string>();
  for (const map of gameCatalog.maps) {
    const key = normalizedKey(map.name);
    assert.ok(key);
    assert.equal(mapNames.has(key), false, `Duplicate normalized map name: ${map.name}`);
    mapNames.add(key);
    assert.equal(isSupportedMap(map.name), true);
    for (const weaponName of [...map.weapons.spawners, ...(map.weapons.vendingMachines ?? [])]) {
      assert.equal(resolveWeaponName(weaponName), weaponName, `Non-canonical weapon ${weaponName} on ${map.name}`);
    }
  }
});

test("weapon provenance covers every canonical weapon exactly once", () => {
  const weaponsByName = new Map(gameCatalog.weapons.map((weapon) => [weapon.name, weapon]));
  const targets = new Set<string>();
  for (const source of rawWeaponSources) {
    const weapon = weaponsByName.get(source.name);
    assert.ok(weapon, `Non-canonical weapon source name: ${source.name}`);
    assert.equal(targets.has(weapon.name), false, `Duplicate source for ${weapon.name}`);
    targets.add(weapon.name);
    assert.equal(source.output, weapon.image);
    assert.match(source.originalSha1, /^[a-f0-9]{40}$/i);
    assert.ok(source.width > 0 && source.height > 0);
    const sourceImage = path.join("public", source.output);
    const canonicalImage = path.join("public", weapon.image);
    assert.equal(existsSync(sourceImage), true, `Missing source output for ${source.name}`);
    assert.equal(existsSync(canonicalImage), true, `Missing canonical image for ${weapon.name}`);
  }
  assert.equal(targets.size, gameCatalog.weapons.length);
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

test("map lookup and wildcard expansion stay backed by the complete catalog", () => {
  for (const map of gameCatalog.maps) {
    assert.deepEqual(getMapWeapons(map.name), map.weapons.spawners);
    assert.deepEqual(expandMapPattern(map.name), [map.name]);
  }
  assert.deepEqual(expandMapPattern("*"), gameCatalog.maps.map((map) => map.name));
  assert.deepEqual(expandMapPattern("__not.a.map__"), []);
});
