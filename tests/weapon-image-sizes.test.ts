import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { catalogWeapons, weaponAssetUrl } from "../src/domain/game-weapons";
import { WEAPON_IMAGE_WIDTHS, preloadCatalogWeapons, weaponImageSource, weaponImageSrcSet } from "../src/domain/weapon-image-sizes";

test("weapon variants keep canonical names and cache versions in every candidate", () => {
  const src = weaponAssetUrl("/weapons/ak.webp");
  assert.match(src, /&v=norm6$/);
  assert.equal(weaponImageSource(src), src.replace("/weapons/", "/weapons/128/"));
  assert.equal(weaponImageSource(src, 128), src.replace("/weapons/", "/weapons/128/"));
  assert.equal(weaponImageSource(src, 512), src);
  assert.equal(weaponImageSrcSet(src), WEAPON_IMAGE_WIDTHS.map(width => `${weaponImageSource(src, width)} ${width}w`).join(", "));
  assert.equal(weaponImageSrcSet("/discord-symbol.svg"), undefined);
  assert.equal(weaponImageSource("/discord-symbol.svg", 128), "/discord-symbol.svg");
  assert.doesNotThrow(() => preloadCatalogWeapons());
});

test("all catalog weapons have transparent, correctly sized, smaller UI variants", async () => {
  for (const weapon of catalogWeapons) {
    const originalSize = (await stat(`public${weapon.image}`)).size;
    for (const width of WEAPON_IMAGE_WIDTHS) {
      const file = `public${weaponImageSource(weapon.image, width)}`;
      const image = await sharp(file).metadata();
      assert.equal(image.width, width, file);
      assert.equal(image.height, width, file);
      assert.equal(image.format, "webp", file);
      assert.equal(image.hasAlpha, true, file);
      if (width < 512) assert.ok((await stat(file)).size < originalSize, file);
    }
  }
});
