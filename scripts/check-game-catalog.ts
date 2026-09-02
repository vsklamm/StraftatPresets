import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import rawCatalog from "../game-data/catalog.json";
import rawMaps from "../game-data/maps.json";
import rawWeaponSources from "../game-data/weapon-sources.json";
import rawWeapons from "../game-data/weapons.json";
import {
  gameCatalog,
  resolveWeaponName,
  getWeaponGameId,
  getWeaponDisplayName,
  getWeaponImage,
  weaponAssetUrl,
  expandMapPattern,
  supportedGameRelease,
  supportedMapCount,
  supportedWeaponCount,
} from "../src/domain/game-catalog";

const excluded = new Set(["aboubi head", "aboubi's head", "barrel", "cochin", "tube gun", "vehicles"]);

assert.deepEqual(rawWeapons.supportedRelease, rawCatalog.supportedRelease, "weapons.json release differs from catalog.json");
assert.equal(rawWeapons.schemaVersion, rawCatalog.schemaVersion, "weapons.json schema differs from catalog.json");
assert.deepEqual(rawWeapons.weapons, rawCatalog.weapons, "weapons.json differs from catalog.json");
assert.deepEqual(rawMaps, rawCatalog.maps, "maps.json differs from catalog.json");
assert.equal(supportedWeaponCount, rawWeapons.weapons.length);
assert.equal(supportedMapCount, rawMaps.length);

const seenWeaponNames = new Set<string>();
const seenGameIds = new Set<string>();
const seenImagePaths = new Set<string>();

for (const weapon of gameCatalog.weapons) {
  assert.equal(excluded.has(weapon.name.toLowerCase()), false, `${weapon.name} must remain excluded`);
  assert.equal(resolveWeaponName(weapon.name), weapon.name);
  assert.ok(weapon.gameId, `Missing gameId for ${weapon.name}`);
  assert.equal(getWeaponDisplayName(weapon.gameId), weapon.name, `Bidirectional lookup failed for ${weapon.gameId}`);
  assert.equal(getWeaponGameId(weapon.name), weapon.gameId, `Game ID lookup failed for ${weapon.name}`);
  assert.equal(getWeaponImage(weapon.gameId), weaponAssetUrl(weapon.image), `Image lookup failed for ${weapon.gameId}`);

  const nameKey = weapon.name.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
  const gameIdKey = weapon.gameId.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
  assert.equal(seenWeaponNames.has(nameKey), false, `Duplicate normalized weapon name: ${weapon.name}`);
  assert.equal(seenGameIds.has(gameIdKey), false, `Duplicate normalized game ID: ${weapon.gameId}`);
  assert.equal(seenImagePaths.has(weapon.image), false, `Duplicate weapon image: ${weapon.image}`);
  seenWeaponNames.add(nameKey);
  seenGameIds.add(gameIdKey);
  seenImagePaths.add(weapon.image);

  const imagePath = path.join("public", weapon.image);
  assert.ok(existsSync(imagePath), `Missing image for ${weapon.name}: ${imagePath}`);
  const bytes = readFileSync(imagePath);
  const metadata = await sharp(imagePath).metadata();
  assert.equal(metadata.hasAlpha, true, `${weapon.name} has no transparent background`);
  assert.equal(metadata.width, 512, `${weapon.name} width is not normalized 512`);
  assert.equal(metadata.height, 512, `${weapon.name} height is not normalized 512`);

  const { data: pixels, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;
  for (let offset = 3; offset < pixels.length; offset += info.channels) if (pixels[offset] === 0) transparentPixels += 1;
  assert.ok(transparentPixels / (info.width * info.height) > 0.05, `${weapon.name} does not contain enough transparent background`);
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString("ascii"), "RIFF", `${weapon.name} is not WebP`);
  assert.equal(Buffer.from(bytes.subarray(8, 12)).toString("ascii"), "WEBP", `${weapon.name} is not WebP`);
}

const catalogImageFiles = [...seenImagePaths]
  .map((imagePath) => path.basename(imagePath))
  .sort();
const publicWeaponFiles = readdirSync(path.join("public", "weapons"))
  .filter((filename) => filename.endsWith(".webp"))
  .sort();
assert.deepEqual(publicWeaponFiles, catalogImageFiles, "public/weapons must contain exactly one canonical image per weapon");

const weaponsByName = new Map(gameCatalog.weapons.map((weapon) => [weapon.name, weapon]));
const sourceTargets = new Set<string>();
for (const source of rawWeaponSources) {
  const weapon = weaponsByName.get(source.name);
  assert.ok(weapon, `Weapon source name is not canonical: ${source.name}`);
  assert.equal(sourceTargets.has(weapon.name), false, `Multiple source entries resolve to ${weapon.name}`);
  sourceTargets.add(weapon.name);
  assert.equal(source.output, weapon.image, `Weapon source output differs from the catalog for ${weapon.name}`);
  assert.match(source.originalSha1, /^[a-f0-9]{40}$/i, `Invalid source SHA-1 for ${source.name}`);
  assert.ok(source.width > 0 && source.height > 0, `Invalid source dimensions for ${source.name}`);
  const sourceOutput = path.join("public", source.output);
  assert.ok(existsSync(sourceOutput), `Missing processed source image for ${source.name}: ${sourceOutput}`);
}
assert.equal(sourceTargets.size, gameCatalog.weapons.length, "Weapon provenance does not cover the complete catalog");

// Map spawners integrity
const seenMapNames = new Set<string>();
for (const map of gameCatalog.maps) {
  assert.ok(map.name, "Map name must not be empty");
  assert.ok(["core", "alt", "dlc"].includes(map.kind), `Invalid map kind ${map.kind} on ${map.name}`);
  assert.ok(map.family, `Missing family on map ${map.name}`);
  const mapKey = map.name.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
  assert.equal(seenMapNames.has(mapKey), false, `Duplicate normalized map name: ${map.name}`);
  seenMapNames.add(mapKey);
  for (const mapWeapon of [...map.weapons.spawners, ...(map.weapons.vendingMachines ?? [])]) {
    assert.equal(resolveWeaponName(mapWeapon), mapWeapon, `Unknown or non-canonical weapon ${mapWeapon} on map ${map.name}`);
  }
}

// Pattern expansion safety
const adobeMaps = expandMapPattern("Adobe_*");
assert.ok(adobeMaps.length >= 6, `Expected at least 6 Adobe maps, got ${adobeMaps.length}`);
const altMaps = expandMapPattern("*_Alt");
assert.ok(altMaps.length > 50, `Expected >50 Alt maps, got ${altMaps.length}`);

console.log(`Catalog OK: STRAFTAT ${supportedGameRelease.version}, ${supportedMapCount} maps, ${supportedWeaponCount} weapons.`);
