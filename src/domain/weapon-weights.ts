export const MIN_WEAPON_WEIGHT = 1;
export const MAX_WEAPON_WEIGHT = 100;

export type WeightedWeapon = { name: string; weight: number };
export type WeaponWithChance = WeightedWeapon & { percent: number };

export function roundChancePercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function formatWeaponPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

export function clampWeaponWeight(value: number): number {
  if (!Number.isFinite(value)) return MIN_WEAPON_WEIGHT;
  return Math.max(MIN_WEAPON_WEIGHT, Math.min(MAX_WEAPON_WEIGHT, Math.floor(value)));
}

export function calculateRelativeWeaponBarWidth(weight: number, maximumWeight: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(maximumWeight) || weight <= 0 || maximumWeight <= 0) return 0;
  return Math.min(100, (weight / maximumWeight) * 100);
}

export function calculateWeaponChances(weapons: WeightedWeapon[]): WeaponWithChance[] {
  const totalWeight = weapons.reduce((sum, weapon) => sum + Math.max(0, weapon.weight), 0);

  return weapons.map((weapon) => {
    const rawPercent = totalWeight > 0 ? (Math.max(0, weapon.weight) / totalWeight) * 100 : 0;
    return {
      ...weapon,
      percent: roundChancePercent(rawPercent),
    };
  });
}
