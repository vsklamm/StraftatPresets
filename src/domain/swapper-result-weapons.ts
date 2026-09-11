import { resolveWeaponName } from "@/src/domain/game-catalog";
import { decodeSwapperExport, type DecodedSwapper } from "@/src/domain/swapper-export";
import type { WeightedWeapon } from "@/src/domain/weapon-weights";

export const MAX_SWAPPER_RESULT_WEAPONS = 15;

export function aggregateSwapperResultWeapons(
  decodedSwappers: readonly DecodedSwapper[],
  limit = MAX_SWAPPER_RESULT_WEAPONS,
): WeightedWeapon[] {
  const counts = new Map<string, number>();

  for (const swapper of decodedSwappers) {
    for (const rule of swapper.rules) {
      for (const remap of rule.remaps) {
        const weaponName = resolveWeaponName(remap.result);
        if (!weaponName) continue;
        counts.set(weaponName, (counts.get(weaponName) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([name, weight]) => ({ name, weight }))
    .sort((left, right) => right.weight - left.weight || left.name.localeCompare(right.name))
    .slice(0, Math.max(0, limit));
}

export async function decodeSwapperResultWeapons(
  encodedValues: readonly string[],
  limit = MAX_SWAPPER_RESULT_WEAPONS,
): Promise<WeightedWeapon[]> {
  const decoded = await Promise.allSettled(encodedValues.map((value) => decodeSwapperExport(value)));
  return aggregateSwapperResultWeapons(
    decoded.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    limit,
  );
}
