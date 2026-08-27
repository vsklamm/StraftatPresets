import { gameCatalog, getWeaponGameId, resolveWeapon } from "@/src/domain/game-catalog";
import type { PresetRevisionContent } from "@/src/domain/preset-content";
import { sortPresetVersionsNewestFirst } from "@/src/domain/preset-version";
import { stripColorAndFormattingTags } from "@/src/domain/straftat-markup";
import { decodeSwapperExport } from "@/src/domain/swapper-export";

export const PRESET_SEARCH_SCHEMA_VERSION = 1;
export const MAX_SEARCH_QUERY_CHARACTERS = 160;
export const MAX_SEARCH_SEGMENTS = 8;

export type PresetSearchTermField = "randomized_weapon" | "swapper_result" | "map";

export type PresetSearchProjection = {
  document: {
    schemaVersion: number;
    title: string;
    author: string;
    description: string;
    secondaryText: string;
  };
  terms: Array<{ field: PresetSearchTermField; value: string }>;
};

export type ResolvedSearchEntities = {
  weaponGameIds: string[];
  mapNames: string[];
};

function plainText(value: string) {
  return stripColorAndFormattingTags(value).replace(/\s+/g, " ").trim();
}

export function normalizeSearchValue(value: string) {
  return plainText(value).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US");
}

function normalizeEntityKey(value: string) {
  return normalizeSearchValue(value).replace(/[^a-z0-9]/g, "");
}

export function splitSearchQuery(value: string) {
  return value.slice(0, MAX_SEARCH_QUERY_CHARACTERS)
    .split(",")
    .map((segment) => plainText(segment))
    .filter(Boolean)
    .slice(0, MAX_SEARCH_SEGMENTS);
}

export function buildFtsMatch(value: string, column: "title" | "author" | "description" | "secondary_text") {
  const tokens = normalizeSearchValue(value).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return null;
  const query = tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
  return `${column} : (${query})`;
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const rows = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let index = 0; index <= left.length; index += 1) rows[index][0] = index;
  for (let index = 0; index <= right.length; index += 1) rows[0][index] = index;

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      rows[leftIndex][rightIndex] = Math.min(
        rows[leftIndex - 1][rightIndex] + 1,
        rows[leftIndex][rightIndex - 1] + 1,
        rows[leftIndex - 1][rightIndex - 1] + substitution,
      );
      if (
        leftIndex > 1 && rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        rows[leftIndex][rightIndex] = Math.min(rows[leftIndex][rightIndex], rows[leftIndex - 2][rightIndex - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length];
}

function allowedEdits(length: number) {
  if (length <= 3) return 0;
  if (length <= 8) return 1;
  return 2;
}

function closestUnique<T>(query: string, candidates: readonly T[], keys: (candidate: T) => readonly string[]) {
  const queryKey = normalizeEntityKey(query);
  if (!queryKey) return null;

  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let tied = false;
  for (const candidate of candidates) {
    const distance = Math.min(...keys(candidate).map((key) => editDistance(queryKey, normalizeEntityKey(key))));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }
  return !tied && bestDistance <= allowedEdits(queryKey.length) ? best : null;
}

export function resolveSearchEntities(value: string): ResolvedSearchEntities {
  const exactWeapon = resolveWeapon(value);
  const weapon = exactWeapon ?? closestUnique(value, gameCatalog.weapons, (candidate) => [candidate.name, candidate.gameId]);
  const exactMap = gameCatalog.maps.find((map) => normalizeEntityKey(map.name) === normalizeEntityKey(value));
  const map = exactMap ?? closestUnique(value, gameCatalog.maps, (candidate) => [candidate.name]);
  return {
    weaponGameIds: weapon ? [weapon.gameId] : [],
    mapNames: map ? [map.name] : [],
  };
}

export async function buildPresetSearchProjection(
  content: PresetRevisionContent,
  authorName: string,
): Promise<PresetSearchProjection> {
  const terms = new Map<string, { field: PresetSearchTermField; value: string }>();
  const secondaryText: string[] = [];
  const addTerm = (field: PresetSearchTermField, value: string | null) => {
    if (value) terms.set(`${field}\0${value}`, { field, value });
  };

  const latestVersion = sortPresetVersionsNewestFirst(content.versions)[0];
  if (latestVersion) {
    for (const playlist of latestVersion.mapPlaylists) {
      secondaryText.push(playlist.name, playlist.description);
      for (const mapName of playlist.mapNames) addTerm("map", mapName);
    }
    for (const configuration of latestVersion.weaponConfigurations) {
      if (configuration.kind === "randomized") {
        for (const weapon of configuration.weapons) addTerm("randomized_weapon", getWeaponGameId(weapon.name));
      } else {
        secondaryText.push(configuration.name, configuration.description ?? "");
        const decoded = await decodeSwapperExport(configuration.encodedValue);
        for (const rule of decoded.rules) {
          for (const remap of rule.remaps) addTerm("swapper_result", getWeaponGameId(remap.result));
        }
      }
    }
  }

  return {
    document: {
      schemaVersion: PRESET_SEARCH_SCHEMA_VERSION,
      title: plainText(content.title),
      author: plainText(authorName),
      description: plainText(content.description),
      secondaryText: secondaryText.map(plainText).filter(Boolean).join(" "),
    },
    terms: [...terms.values()],
  };
}
