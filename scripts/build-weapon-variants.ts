import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { catalogWeapons } from "../src/domain/game-weapons";
import { WEAPON_IMAGE_WIDTHS, weaponImageSource } from "../src/domain/weapon-image-sizes";

/** Preserve the reviewed 512px normalization and derive all smaller sizes from it. */
export async function buildWeaponVariants() {
  const totals = new Map<number, number>([...WEAPON_IMAGE_WIDTHS, 512].map(width => [width, 0]));
  for (const width of WEAPON_IMAGE_WIDTHS.filter(width => width < 512)) {
    await mkdir(path.join("public", "weapons", String(width)), { recursive: true });
  }
  for (const weapon of catalogWeapons) {
    const source = await readFile(`public${weapon.image}`);
    const metadata = await sharp(source).metadata();
    if (metadata.width !== 512 || metadata.height !== 512 || !metadata.hasAlpha) {
      throw new Error(`Expected a normalized 512px transparent master: ${weapon.image}`);
    }
    totals.set(512, totals.get(512)! + source.length);
    for (const width of WEAPON_IMAGE_WIDTHS.filter(width => width < 512)) {
      const output = `public${weaponImageSource(weapon.image, width)}`;
      await sharp(source).resize(width, width, { kernel: sharp.kernel.lanczos3 })
        .webp({ quality: 82, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(output);
      totals.set(width, totals.get(width)! + (await stat(output)).size);
    }
  }
  console.table(WEAPON_IMAGE_WIDTHS.map(width => ({
    width,
    files: catalogWeapons.length,
    totalKB: +(totals.get(width)! / 1000).toFixed(1),
    averageKB: +(totals.get(width)! / catalogWeapons.length / 1000).toFixed(2),
    saved: `${(100 * (1 - totals.get(width)! / totals.get(512)!)).toFixed(1)}%`,
  })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildWeaponVariants().catch(error => { console.error(error); process.exitCode = 1; });
}
