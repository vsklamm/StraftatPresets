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
  return `${path}${separator}v=norm6`;
}

const weaponImageMap = new Map<string, string>();
const weaponGameIdMap = new Map<string, string>();
for (const weapon of catalogWeapons) {
  const nameKey = weapon.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const gameIdKey = weapon.gameId.toLowerCase().replace(/[^a-z0-9]/g, "");
  weaponImageMap.set(nameKey, weapon.image);
  weaponImageMap.set(gameIdKey, weapon.image);
  weaponGameIdMap.set(nameKey, weapon.gameId);
  weaponGameIdMap.set(gameIdKey, weapon.gameId);
}

export function getWeaponImage(value: string): string | null {
  if (!value || typeof value !== "string") return null;
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const image = weaponImageMap.get(key);
  return image ? weaponAssetUrl(image) : null;
}

export function compareWeaponsInGameOrder(leftName: string, rightName: string): number {
  const leftKey = weaponGameIdMap.get(leftName.toLowerCase().replace(/[^a-z0-9]/g, "")) ?? leftName;
  const rightKey = weaponGameIdMap.get(rightName.toLowerCase().replace(/[^a-z0-9]/g, "")) ?? rightName;
  return leftKey.localeCompare(rightKey, "en-US", { sensitivity: "base" })
    || leftName.localeCompare(rightName, "en-US", { sensitivity: "base" });
}
