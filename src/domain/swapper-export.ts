/**
 * Swapper Preset Export & Import Utility
 *
 * Implements Straftat Swapper preset serialization, data verification, and Base64 encoding/decoding.
 * Compatible with in-game SpawnerManager / WeaponRemapper and community tools.
 *
 * Inspired by and compatible with STRAFTOOLS by clodcan (https://github.com/clodcan/STRAFTOOLS).
 */

import { z } from "zod";
import { decodeCompressedJson } from "./base64-decode";
import {
  getWeaponDisplayName,
  getWeaponGameId,
  resolveWeaponName,
} from "./game-catalog";

const weaponRemapSchema = z.object({
  Precursor: z.string().trim().min(1),
  Result: z.string().trim().min(1),
});

const mapRuleSchema = z.object({
  MapString: z.string().trim().min(1),
  WeaponRemaps: z.array(weaponRemapSchema),
}).passthrough();

export const swapperExportSchema = z.object({
  type: z.literal("swap").optional(),
  Preset: z.object({
    Name: z.string().trim().min(1).max(500),
    Maps: z.array(mapRuleSchema).max(1000),
  }).passthrough(),
}).passthrough();

export type SwapperRemap = {
  precursor: string; // Canonical display name or Game ID
  result: string;    // Canonical display name or Game ID
};

export type SwapperMapRule = {
  mapString: string;
  remaps: SwapperRemap[];
};

export type DecodedSwapper = {
  name: string;
  remapCount: number;
  rules: SwapperMapRule[];
};

/**
 * Decodes and validates a Base64-compressed Swapper export payload.
 * Translates internal Game IDs to canonical human-readable display names.
 */
export async function decodeSwapperExport(encodedValue: string): Promise<DecodedSwapper> {
  const value = await decodeCompressedJson(encodedValue, "swapper export");
  const parsed = swapperExportSchema.safeParse(value);
  if (!parsed.success) throw new Error("Swapper export has an invalid schema.");

  let remapCount = 0;
  const rules: SwapperMapRule[] = [];

  for (const mapRule of parsed.data.Preset.Maps) {
    const remaps: SwapperRemap[] = [];
    for (const remap of mapRule.WeaponRemaps) {
      const precursorDisplay = getWeaponDisplayName(remap.Precursor) ?? remap.Precursor;
      const resultDisplay = getWeaponDisplayName(remap.Result) ?? remap.Result;
      remaps.push({ precursor: precursorDisplay, result: resultDisplay });
      remapCount += 1;
    }
    rules.push({
      mapString: mapRule.MapString,
      remaps,
    });
  }

  return {
    name: parsed.data.Preset.Name,
    remapCount,
    rules,
  };
}

export type SwapperInputRule = {
  mapString: string;
  swaps: Array<{ precursor: string; result: string }>;
};

/**
 * Builds the canonical JSON structure for in-game Swapper presets.
 * Translates display names to Game IDs, filters no-op swaps, and merges duplicate map rules.
 */
export function buildSwapperPresetJson(name: string, rules: SwapperInputRule[]) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Swapper preset name cannot be empty");

  const mapRuleMap = new Map<string, Array<{ Precursor: string; Result: string }>>();

  for (const rule of rules) {
    const rawMapString = rule.mapString.trim();
    if (!rawMapString) continue;

    // Filter out no-op swaps where precursor equals result
    const validSwaps = rule.swaps.filter((s) => {
      const p = resolveWeaponName(s.precursor) ?? s.precursor;
      const r = resolveWeaponName(s.result) ?? s.result;
      return p.toLowerCase() !== r.toLowerCase();
    });

    if (validSwaps.length === 0) continue;

    const existingSwaps = mapRuleMap.get(rawMapString) ?? [];
    for (const swap of validSwaps) {
      const precursorGameId = getWeaponGameId(swap.precursor) ?? swap.precursor;
      const resultGameId = getWeaponGameId(swap.result) ?? swap.result;

      // Avoid duplicate remaps for the same precursor on the same map
      const existingIdx = existingSwaps.findIndex((s) => s.Precursor.toLowerCase() === precursorGameId.toLowerCase());
      if (existingIdx >= 0) {
        existingSwaps[existingIdx] = { Precursor: precursorGameId, Result: resultGameId };
      } else {
        existingSwaps.push({ Precursor: precursorGameId, Result: resultGameId });
      }
    }
    mapRuleMap.set(rawMapString, existingSwaps);
  }

  const mapsArray = Array.from(mapRuleMap.entries()).map(([mapString, weaponRemaps]) => ({
    MapString: mapString,
    WeaponRemaps: weaponRemaps,
  }));

  return {
    type: "swap" as const,
    Preset: {
      Name: cleanName,
      Maps: mapsArray,
    },
  };
}

