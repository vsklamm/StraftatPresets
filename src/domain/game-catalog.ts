import rawWeapons from "@/game-data/weapons.json";
import rawMaps from "@/game-data/maps.json";
import { type CatalogWeapon, weaponAssetUrl } from "@/src/domain/game-weapons";

const rawCatalog = {
  schemaVersion: rawWeapons.schemaVersion,
  supportedRelease: rawWeapons.supportedRelease,
  weapons: rawWeapons.weapons,
  maps: rawMaps as CatalogMap[],
};

export type MapKind = "core" | "alt" | "dlc";

export type { CatalogWeapon };

export type CatalogMapWeapons = {
  spawners: string[];
  vendingMachines?: string[];
};

export type CatalogMap = {
  name: string;
  kind: MapKind;
  family: string;
  isDlc: boolean;
  weapons: CatalogMapWeapons;
};

export type GameCatalog = {
  schemaVersion: number;
  supportedRelease: { version: string; publishedAt: string; sourceUrl: string };
  weapons: CatalogWeapon[];
  maps: CatalogMap[];
};

function normalizeLookupKey(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function assertCatalog(value: unknown): asserts value is GameCatalog {
  if (!value || typeof value !== "object") throw new Error("Game catalog is not an object");
  const catalog = value as Partial<GameCatalog>;
  if (catalog.schemaVersion !== 2) throw new Error("Unsupported game catalog schema version (expected 2)");
  if (!catalog.supportedRelease || !/^\d+\.\d+\.\d+$/.test(catalog.supportedRelease.version)) {
    throw new Error("Invalid supported STRAFTAT release version format");
  }
  if (!Array.isArray(catalog.weapons) || !Array.isArray(catalog.maps)) {
    throw new Error("Invalid game catalog lists");
  }
  if (catalog.weapons.length < 70 || catalog.maps.length < 350) {
    throw new Error("Game catalog is implausibly small; refusing potentially destructive update");
  }

  const weaponKeys = new Set<string>();
  const gameIds = new Set<string>();
  const imagePaths = new Set<string>();
  const forbiddenWeapons = new Set(["aboubihead", "barrel", "cochin", "tubegun", "vehicles"]);

  for (const weapon of catalog.weapons) {
    if (!weapon.name || !weapon.gameId || !weapon.image.startsWith("/weapons/")) {
      throw new Error(`Invalid weapon catalog entry: ${weapon.name}`);
    }
    const key = normalizeLookupKey(weapon.name);
    if (forbiddenWeapons.has(key)) throw new Error(`Excluded weapon found in catalog: ${weapon.name}`);
    if (weaponKeys.has(key)) throw new Error(`Duplicate weapon display name: ${weapon.name}`);
    weaponKeys.add(key);

    const gameIdKey = normalizeLookupKey(weapon.gameId);
    if (gameIds.has(gameIdKey)) throw new Error(`Duplicate weapon gameId: ${weapon.gameId}`);
    gameIds.add(gameIdKey);

    if (imagePaths.has(weapon.image)) throw new Error(`Duplicate weapon image path: ${weapon.image}`);
    imagePaths.add(weapon.image);
  }

  const mapNames = new Set<string>();
  for (const map of catalog.maps) {
    if (!map.name || !(["core", "alt", "dlc"] as const).includes(map.kind)) {
      throw new Error(`Invalid map catalog entry: ${map.name}`);
    }
    if (mapNames.has(map.name)) throw new Error(`Duplicate map name: ${map.name}`);
    mapNames.add(map.name);

    if (!map.weapons || !Array.isArray(map.weapons.spawners)) {
      throw new Error(`Map ${map.name} is missing weapons.spawners array`);
    }
    for (const spawnerWeapon of map.weapons.spawners) {
      if (!weaponKeys.has(normalizeLookupKey(spawnerWeapon))) {
        throw new Error(`Map ${map.name} references unknown spawner weapon: ${spawnerWeapon}`);
      }
    }
  }
}

assertCatalog(rawCatalog);

export const gameCatalog: Readonly<GameCatalog> = rawCatalog;
export const supportedGameRelease = gameCatalog.supportedRelease;
export const supportedWeaponCount = gameCatalog.weapons.length;
export const supportedMapCount = gameCatalog.maps.length;

export { weaponAssetUrl };

// Bidirectional and normalized lookup indices
const weaponByNameKey = new Map<string, CatalogWeapon>();
const weaponByGameIdKey = new Map<string, CatalogWeapon>();

for (const weapon of gameCatalog.weapons) {
  weaponByNameKey.set(normalizeLookupKey(weapon.name), weapon);
  weaponByGameIdKey.set(normalizeLookupKey(weapon.gameId), weapon);
}

// Aliases for historical / community / wiki spelling variations
const legacyWeaponAliases: Record<string, string> = {
  "thekatana": "Katana",
  "katana": "Katana",
  "handcanon": "Hand Cannon",
  "handcannon": "Hand Cannon",
  "javalmahmaerd": "Jahval Mahmaerd",
  "jahvalmahmaerd": "Jahval Mahmaerd",
  "godsword": "God Sword",
  "flashlight": "Flash Light",
  "aaa12": "AAA12",
  "hillh15": "Hill_H15",
  "hkcaws": "HK_Caws",
  "hkg11": "HK_G11",
  "mac10": "Mac10",
  "stunmine": "Stun Mine",
  "bublee": "Bublee",
  "bukanee": "Bukanee",
  "nugget": "Serac",
  "bigfattybro": "Oklahoma",
  "ar15": "AR",
  "gun": "Pistol",
  "akk": "AK",
  "dftorrent": "Torrent",
  "dfcyst": "Cyst",
  "dfblister": "Blister",
  "dfgodsword": "God Sword",
};

const mapByName = new Map<string, CatalogMap>();
for (const map of gameCatalog.maps) {
  mapByName.set(map.name, map);
}

/**
 * Resolves a weapon by display name, game ID, or known alias case-insensitively.
 */
export function resolveWeapon(value: string): CatalogWeapon | null {
  if (!value || typeof value !== "string") return null;
  const key = normalizeLookupKey(value);
  
  // 1. Direct name match
  const byName = weaponByNameKey.get(key);
  if (byName) return byName;

  // 2. Direct gameId match
  const byGameId = weaponByGameIdKey.get(key);
  if (byGameId) return byGameId;

  // 3. Known alias match
  const aliasTarget = legacyWeaponAliases[key];
  if (aliasTarget) {
    return weaponByNameKey.get(normalizeLookupKey(aliasTarget)) ?? null;
  }

  return null;
}

/**
 * Returns canonical display name for a given weapon string (or null if unrecognized).
 */
export function resolveWeaponName(value: string): string | null {
  return resolveWeapon(value)?.name ?? null;
}

/**
 * Returns the serialized game ID for Base64 payloads (e.g. "Serac" -> "Nugget").
 */
export function getWeaponGameId(displayName: string): string | null {
  const weapon = resolveWeapon(displayName);
  return weapon?.gameId ?? null;
}

/**
 * Returns the human-readable display name from a serialized game ID (e.g. "Nugget" -> "Serac").
 */
export function getWeaponDisplayName(gameId: string): string | null {
  const weapon = resolveWeapon(gameId);
  return weapon?.name ?? null;
}

/**
 * Returns public WebP image URL for a given weapon name or ID.
 */
export function getWeaponImage(value: string): string | null {
  const weapon = resolveWeapon(value);
  return weapon ? weaponAssetUrl(weapon.image) : null;
}

/**
 * Checks if a map name exists in the catalog.
 */
export function isSupportedMap(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  return mapByName.has(value.trim());
}


/**
 * Safely expands a map wildcard pattern (e.g. "Adobe_*", "*_Alt", "*") into matching map names.
 * Escapes regex special characters to prevent regex injection or unintended dot matching.
 */
export function expandMapPattern(pattern: string): string[] {
  if (!pattern || typeof pattern !== "string") return [];
  const trimmed = pattern.trim();
  
  // Escape regex special characters (except * and ?)
  const escaped = trimmed
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  try {
    const regex = new RegExp(`^${escaped}$`, "i");
    return gameCatalog.maps
      .filter((map) => regex.test(map.name))
      .map((map) => map.name);
  } catch {
    return [];
  }
}
