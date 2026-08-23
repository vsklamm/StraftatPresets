import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  gameCatalog,
  resolveWeaponName,
  getWeaponGameId,
  getWeaponDisplayName,
  expandMapPattern,
  supportedGameRelease,
  supportedMapCount,
  supportedWeaponCount,
} from "../src/domain/game-catalog";

const excluded = new Set(["aboubi head", "aboubi's head", "barrel", "cochin", "tube gun", "vehicles"]);

assert.equal(supportedWeaponCount, 72, `Expected exactly 72 weapons, found ${supportedWeaponCount}`);
assert.equal(supportedMapCount, 369, `Expected exactly 369 maps, found ${supportedMapCount}`);

const seenWeaponNames = new Set<string>();
const seenGameIds = new Set<string>();

for (const weapon of gameCatalog.weapons) {
  assert.equal(excluded.has(weapon.name.toLowerCase()), false, `${weapon.name} must remain excluded`);
  assert.equal(resolveWeaponName(weapon.name), weapon.name);
  assert.ok(weapon.gameId, `Missing gameId for ${weapon.name}`);
  assert.equal(getWeaponDisplayName(weapon.gameId), weapon.name, `Bidirectional lookup failed for ${weapon.gameId}`);
  assert.equal(getWeaponGameId(weapon.name), weapon.gameId, `Game ID lookup failed for ${weapon.name}`);

  assert.equal(seenWeaponNames.has(weapon.name), false, `Duplicate weapon name: ${weapon.name}`);
  assert.equal(seenGameIds.has(weapon.gameId), false, `Duplicate game ID: ${weapon.gameId}`);
  seenWeaponNames.add(weapon.name);
  seenGameIds.add(weapon.gameId);

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

// Map spawners integrity
for (const map of gameCatalog.maps) {
  assert.ok(map.name, "Map name must not be empty");
  assert.ok(["core", "alt", "dlc"].includes(map.kind), `Invalid map kind ${map.kind} on ${map.name}`);
  assert.ok(map.family, `Missing family on map ${map.name}`);
  for (const spawner of map.weapons.spawners) {
    assert.ok(seenWeaponNames.has(spawner), `Unknown spawner weapon ${spawner} on map ${map.name}`);
  }
}

// Pattern expansion safety
const adobeMaps = expandMapPattern("Adobe_*");
assert.ok(adobeMaps.length >= 6, `Expected at least 6 Adobe maps, got ${adobeMaps.length}`);
const altMaps = expandMapPattern("*_Alt");
assert.ok(altMaps.length > 50, `Expected >50 Alt maps, got ${altMaps.length}`);

console.log(`Catalog OK: STRAFTAT ${supportedGameRelease.version}, ${supportedMapCount} maps, ${supportedWeaponCount} weapons.`);
