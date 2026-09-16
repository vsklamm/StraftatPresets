import rawWeapons from "@/game-data/weapons.json";
import rawMaps from "@/game-data/maps.json";

export type CatalogWeapon = {
  name: string;
  gameId: string;
  image: string;
};

export const catalogWeapons: readonly CatalogWeapon[] = rawWeapons.weapons;
export const supportedGameRelease = rawWeapons.supportedRelease;
export const supportedWeaponCount = rawWeapons.weapons.length;
export const supportedMapCount = rawMaps.length;

export function weaponAssetUrl(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}game=${encodeURIComponent(supportedGameRelease.version)}&v=norm6`;
}

const weaponImageMap = new Map<string, string>();
for (const weapon of catalogWeapons) {
  weaponImageMap.set(weapon.name.toLowerCase().replace(/[^a-z0-9]/g, ""), weapon.image);
  weaponImageMap.set(weapon.gameId.toLowerCase().replace(/[^a-z0-9]/g, ""), weapon.image);
}

export function getWeaponImage(value: string): string | null {
  if (!value || typeof value !== "string") return null;
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const image = weaponImageMap.get(key);
  return image ? weaponAssetUrl(image) : null;
}
