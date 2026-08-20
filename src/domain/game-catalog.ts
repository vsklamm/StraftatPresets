import rawCatalog from "@/game-data/catalog.json";
import { MIN_WEAPON_WEIGHT, MAX_WEAPON_WEIGHT } from "@/src/domain/weapon-weights";

type MapKind = "core" | "alt" | "dlc";
type CatalogWeapon = { name: string; image: string };
type CatalogMap = { name: string; kind: MapKind };
export type GameCatalog = {
  schemaVersion: number;
  supportedRelease: { version: string; publishedAt: string; sourceUrl: string };
  weapons: CatalogWeapon[];
  maps: CatalogMap[];
};

export type PresetGameData = {
  mapNames?: readonly string[];
  randomizedWeapons?: readonly { name: string; weight: number }[];
};

function lookupKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function assertCatalog(value: unknown): asserts value is GameCatalog {
  if (!value || typeof value !== "object") throw new Error("Game catalog is not an object");
  const catalog = value as Partial<GameCatalog>;
  if (catalog.schemaVersion !== 1) throw new Error("Unsupported game catalog schema");
  if (!catalog.supportedRelease || !/^\d+\.\d+\.\d+$/.test(catalog.supportedRelease.version)) throw new Error("Invalid supported STRAFTAT release");
  if (!Array.isArray(catalog.weapons) || !Array.isArray(catalog.maps)) throw new Error("Invalid game catalog lists");
  if (catalog.weapons.length < 50 || catalog.maps.length < 300) throw new Error("Game catalog is implausibly small; refusing a potentially destructive update");

  const weaponKeys = new Set<string>();
  const imagePaths = new Set<string>();
  const forbiddenWeapons = new Set(["aboubi head", "aboubi's head", "barrel", "cochin", "tube gun", "vehicles"].map(lookupKey));
  for (const weapon of catalog.weapons) {
    if (!weapon.name || !weapon.image.startsWith("/weapons/")) throw new Error(`Invalid weapon catalog entry: ${weapon.name}`);
    const key = lookupKey(weapon.name);
    if (forbiddenWeapons.has(key)) throw new Error(`Excluded weapon: ${weapon.name}`);
    if (weaponKeys.has(key)) throw new Error(`Duplicate weapon name: ${weapon.name}`);
    weaponKeys.add(key);
    if (imagePaths.has(weapon.image)) throw new Error(`Duplicate weapon image: ${weapon.image}`);
    imagePaths.add(weapon.image);
  }

  const mapNames = new Set<string>();
  for (const map of catalog.maps) {
    if (!map.name || !(["core", "alt", "dlc"] as const).includes(map.kind)) throw new Error(`Invalid map catalog entry: ${map.name}`);
    if (mapNames.has(map.name)) throw new Error(`Duplicate map name: ${map.name}`);
    mapNames.add(map.name);
  }
}

assertCatalog(rawCatalog);

export const gameCatalog: Readonly<GameCatalog> = rawCatalog;
export const supportedGameRelease = gameCatalog.supportedRelease;
export const supportedWeaponCount = gameCatalog.weapons.length;
export const supportedMapCount = gameCatalog.maps.length;

export function weaponAssetUrl(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}game=${encodeURIComponent(supportedGameRelease.version)}&v=norm3`;
}

const weaponByLookupKey = new Map<string, CatalogWeapon>();
for (const weapon of gameCatalog.weapons) {
  weaponByLookupKey.set(lookupKey(weapon.name), weapon);
}

const mapNames = new Set(gameCatalog.maps.map((map) => map.name));

export function resolveWeaponName(value: string) {
  return weaponByLookupKey.get(lookupKey(value))?.name ?? null;
}

export function getWeaponImage(value: string) {
  const weapon = weaponByLookupKey.get(lookupKey(value));
  return weapon ? weaponAssetUrl(weapon.image) : null;
}

export function isSupportedMap(value: string) {
  return mapNames.has(value);
}

export function validatePresetGameData(data: PresetGameData) {
  const errors: string[] = [];
  const canonicalWeapons: Array<{ name: string; weight: number }> = [];
  const seenWeapons = new Set<string>();

  for (const mapName of data.mapNames ?? []) {
    if (!isSupportedMap(mapName)) errors.push(`Unknown map: ${mapName}`);
  }

  for (const weapon of data.randomizedWeapons ?? []) {
    const canonicalName = resolveWeaponName(weapon.name);
    if (!canonicalName) {
      errors.push(`Unknown weapon: ${weapon.name}`);
      continue;
    }
    if (!Number.isSafeInteger(weapon.weight) || weapon.weight < MIN_WEAPON_WEIGHT || weapon.weight > MAX_WEAPON_WEIGHT) errors.push(`Invalid weight for ${canonicalName}`);
    if (seenWeapons.has(canonicalName)) errors.push(`Duplicate weapon: ${canonicalName}`);
    seenWeapons.add(canonicalName);
    canonicalWeapons.push({ name: canonicalName, weight: weapon.weight });
  }

  return { valid: errors.length === 0, errors, canonicalWeapons } as const;
}
