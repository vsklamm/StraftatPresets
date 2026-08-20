import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import provenance from "../game-data/weapon-sources.json";
import {
  gameCatalog,
  resolveWeaponName,
  supportedGameRelease,
  supportedMapCount,
  supportedWeaponCount,
} from "../src/domain/game-catalog";

const excluded = new Set(["aboubi head", "aboubi's head", "barrel", "cochin", "tube gun", "vehicles"]);
const sourceByName = new Map(provenance.map((source) => [source.name, source]));

for (const weapon of gameCatalog.weapons) {
  assert.equal(excluded.has(weapon.name.toLowerCase()), false, `${weapon.name} must remain excluded`);
  assert.equal(resolveWeaponName(weapon.name.toLowerCase()), weapon.name);
  assert.ok(sourceByName.has(weapon.name), `Missing provenance for ${weapon.name}`);
  const imagePath = path.join("public", weapon.image);
  assert.ok(existsSync(imagePath), `Missing image for ${weapon.name}: ${imagePath}`);
  const bytes = readFileSync(imagePath);
  const metadata = await sharp(imagePath).metadata();
  assert.equal(metadata.hasAlpha, true, `${weapon.name} has no transparent background`);
  assert.equal(metadata.width, 512, `${weapon.name} width is not normalized 512`);
  assert.equal(metadata.height, 512, `${weapon.name} height is not normalized 512`);

  const source = sourceByName.get(weapon.name)!;
  const rawPath = path.join("game-data", "raw-weapons", path.basename(weapon.image));
  if (existsSync(rawPath)) {
    const rawMetadata = await sharp(rawPath).metadata();
    assert.equal(rawMetadata.width, source.width, `${weapon.name} raw width changed`);
    assert.equal(rawMetadata.height, source.height, `${weapon.name} raw height changed`);
  }

  assert.equal(source.backgroundRemoval?.method, "border-connected-flat-v1", `${weapon.name} has no recorded background extraction`);
  const { data: pixels, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;
  for (let offset = 3; offset < pixels.length; offset += info.channels) if (pixels[offset] === 0) transparentPixels += 1;
  assert.ok(transparentPixels / (info.width * info.height) > 0.1, `${weapon.name} does not contain enough transparent background`);
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString("ascii"), "RIFF", `${weapon.name} is not WebP`);
  assert.equal(Buffer.from(bytes.subarray(8, 12)).toString("ascii"), "WEBP", `${weapon.name} is not WebP`);
  for (const chunk of ["EXIF", "XMP ", "ICCP"]) assert.equal(Buffer.from(bytes).includes(Buffer.from(chunk)), false, `${weapon.name} contains ${chunk} metadata`);
}

assert.equal(sourceByName.size, supportedWeaponCount, "Provenance count does not match weapon count");
console.log(`Catalog OK: STRAFTAT ${supportedGameRelease.version}, ${supportedMapCount} maps, ${supportedWeaponCount} weapons.`);
