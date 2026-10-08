import type { ComponentType } from "react";

export interface SeasonalEffectProps {
  content: readonly HTMLElement[];
}

export interface SeasonalEffect {
  id: string;
  from: readonly [month: number, day: number];
  through: readonly [month: number, day: number];
  load: () => Promise<{ default: ComponentType<SeasonalEffectProps> }>;
}

// Keep this registry free of eager imports of effects, styles and rendering libraries.
export const seasonalEffects: readonly SeasonalEffect[] = [
  { id: "halloween", from: [10, 10], through: [11, 5], load: () => import("./halloween/effect") },
];

/** Inclusive windows in the visitor's local calendar, including windows across New Year. */
export function selectSeasonalEffect(effects: readonly SeasonalEffect[], date: Date): SeasonalEffect | undefined {
  const today = (date.getMonth() + 1) * 100 + date.getDate();
  return effects.find((effect) => {
    const start = effect.from[0] * 100 + effect.from[1];
    const end = effect.through[0] * 100 + effect.through[1];
    return start <= end ? today >= start && today <= end : today >= start || today <= end;
  });
}
