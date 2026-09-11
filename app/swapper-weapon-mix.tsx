"use client";

import { useEffect, useState } from "react";
import { WeaponMix } from "@/app/weapon-mix";
import { decodeSwapperResultWeapons } from "@/src/domain/swapper-result-weapons";
import type { WeightedWeapon } from "@/src/domain/weapon-weights";

export function SwapperWeaponMix({ encodedValues }: { encodedValues: readonly string[] }) {
  const [decoded, setDecoded] = useState<{ source: readonly string[]; weapons: WeightedWeapon[] } | null>(null);
  const weapons = decoded?.source === encodedValues ? decoded.weapons : [];

  useEffect(() => {
    let cancelled = false;
    void decodeSwapperResultWeapons(encodedValues).then((nextWeapons) => {
      if (!cancelled) setDecoded({ source: encodedValues, weapons: nextWeapons });
    });
    return () => {
      cancelled = true;
    };
  }, [encodedValues]);

  return weapons.length ? <WeaponMix weapons={weapons} variant="swapper" /> : null;
}
