"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import { getWeaponImage } from "@/src/domain/game-weapons";
import { MAX_SWAPPER_RESULT_WEAPONS } from "@/src/domain/swapper-result-weapons";
import { calculateWeaponChances, type WeightedWeapon } from "@/src/domain/weapon-weights";
import { observeAnimationVisibility } from "@/src/lib/animation-visibility";

const MAX_VISIBLE_WEAPONS = 18;
const X_ANCHORS = [74, 52, 28, 38];
const FLOAT_PATTERN_COUNT = 13;

function hashName(name: string) {
  return [...name].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

type WeaponLayout = (index: number, count: number, hash: number, xJitter: number, yJitter: number, seed: number) => { x: number; y: number };

const WEAPON_LAYOUTS: WeaponLayout[] = [
  // Spiral
  (index, count, hash, xJitter, yJitter) => {
    const angle = index * 2.39996;
    const radiusX = 6 + index * 4;
    const radiusY = 10 + index * 8;
    return {
      x: 52 + Math.cos(angle) * radiusX + xJitter,
      y: 135 + Math.sin(angle) * radiusY + yJitter,
    };
  },
  // Chevron
  (index, count, hash, xJitter, yJitter) => {
    const wing = index % 2 === 0 ? 1 : -1;
    const step = Math.floor((index + 1) / 2);
    return {
      x: 76 - step * 7 + xJitter,
      y: 135 + wing * step * 24 + yJitter,
    };
  },
  // Opposing anchors
  (index, count, hash, xJitter, yJitter) => {
    if (index === 0) return { x: 34 + xJitter * 0.5, y: 135 + yJitter * 0.5 };
    if (index === 1) return { x: 68 + xJitter * 0.5, y: 135 + yJitter * 0.5 };
    const side = index % 2 === 0 ? 22 : 78;
    const heightOffset = Math.floor(index / 2) * 20;
    return { x: side + xJitter, y: 60 + heightOffset + yJitter };
  },
  // Center with a surrounding arc
  (index, count, hash, xJitter, yJitter) => {
    if (index === 0) return { x: 50 + xJitter * 0.2, y: 140 + yJitter * 0.2 };
    if (index <= 5) {
      const arcProgress = (index - 1) / 4;
      const angle = Math.PI * 1.15 + arcProgress * (Math.PI * 0.7);
      return {
        x: 50 + Math.cos(angle) * 26 + xJitter,
        y: 140 + Math.sin(angle) * 75 + yJitter,
      };
    }
    return {
      x: 24 + (index * 13) % 52 + xJitter,
      y: 65 + (index * 19) % 130 + yJitter,
    };
  },
  // Scattered grid
  (index, count, hash, xJitter, yJitter, seed) => {
    const placementIndex = count ? (index + seed * 5) % count : index;
    const rowCount = Math.ceil(count / X_ANCHORS.length);
    const row = Math.floor(placementIndex / X_ANCHORS.length);
    const column = placementIndex % X_ANCHORS.length;
    return {
      x: X_ANCHORS[column] + xJitter,
      y: rowCount === 1 ? 135 + yJitter : 60 + row * (150 / Math.max(1, rowCount - 1)) + yJitter,
    };
  },
];

type WeaponAnimation = (index: number, hash: number) => { duration: number; delay: number };

const WEAPON_ANIMATIONS: Record<number, WeaponAnimation> = {
  6: (index) => ({ duration: 0.5, delay: index * 0.05 }),
  7: (index, hash) => { const d = 0.8 + seededRandom(hash) * 0.4; return { duration: d, delay: -(seededRandom(hash + 1) * d) }; },
  8: (index) => ({ duration: 1.0, delay: index * 0.05 }),
  9: (index, hash) => { const d = 0.6 + seededRandom(hash) * 0.2; return { duration: d, delay: -(seededRandom(hash + 1) * d) }; },
  10: (index, hash) => { const d = 1.0 + seededRandom(hash) * 0.4; return { duration: d, delay: -(seededRandom(hash + 1) * d) }; },
  11: (index, hash) => { const d = 0.5 + seededRandom(hash) * 0.2; return { duration: d, delay: -(seededRandom(hash + 1) * d) }; },
  12: (index, hash) => { const d = 0.8 + seededRandom(hash) * 0.3; return { duration: d, delay: -(seededRandom(hash + 1) * d) }; },
  13: (index, hash) => { const d = 1.2 + seededRandom(hash) * 0.5; return { duration: d, delay: -(seededRandom(hash + 1) * d) }; },
};

export function WeaponMix({
  weapons,
  copyButtonRef,
  copyBurst,
  variant = "randomized",
}: {
  weapons: WeightedWeapon[];
  copyButtonRef?: RefObject<HTMLButtonElement | null>;
  copyBurst?: number;
  variant?: "randomized" | "swapper";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousBurst = useRef(copyBurst ?? 0);
  const [isCollecting, setIsCollecting] = useState(false);
  const [layoutSeed, setLayoutSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [patternSeed] = useState(() => Math.floor(Math.random() * FLOAT_PATTERN_COUNT));

  useEffect(() => {
    if (rootRef.current) return observeAnimationVisibility(rootRef.current);
  }, []);

  const visibleLimit = variant === "swapper" ? MAX_SWAPPER_RESULT_WEAPONS : MAX_VISIBLE_WEAPONS;
  const weighted = calculateWeaponChances(weapons)
    .filter((weapon) => getWeaponImage(weapon.name))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, visibleLimit);
  const maxWeight = Math.max(...weighted.map((weapon) => weapon.weight), 1);

  useEffect(() => {
    if (copyBurst === undefined || copyBurst === previousBurst.current) return;
    previousBurst.current = copyBurst;

    const button = copyButtonRef?.current;
    const root = rootRef.current;
    if (!button || !root) return;
    const target = button.getBoundingClientRect();
    const items = root.querySelectorAll<HTMLDivElement>(".weapon-atmosphere-item");

    // Finish all geometry reads before changing any element styles.
    const measuredItems = Array.from(items, (item) => ({ item, rect: item.getBoundingClientRect() }));
    measuredItems.forEach(({ item, rect: itemRect }, index) => {
      const copyX = target.left + target.width / 2 - itemRect.left - itemRect.width / 2;
      const copyY = target.top + target.height / 2 - itemRect.top - itemRect.height / 2;
      const distance = Math.max(1, Math.hypot(copyX, copyY));
      const direction = index % 2 === 0 ? 1 : -1;
      const bend = Math.min(145, 54 + distance * .13) * direction;
      const perpendicularX = -copyY / distance;
      const perpendicularY = copyX / distance;
      item.style.setProperty("--copy-x", `${copyX}px`);
      item.style.setProperty("--copy-y", `${copyY}px`);
      item.style.setProperty("--flare-x", `${-copyX / distance * 12}px`);
      item.style.setProperty("--flare-y", `${-copyY / distance * 12}px`);
      item.style.setProperty("--arc-x", `${copyX * .38 + perpendicularX * bend}px`);
      item.style.setProperty("--arc-y", `${copyY * .38 + perpendicularY * bend}px`);
      item.style.setProperty("--mid-x", `${copyX * .76 - perpendicularX * bend * .24}px`);
      item.style.setProperty("--mid-y", `${copyY * .76 - perpendicularY * bend * .24}px`);
      item.style.setProperty("--spin-a", `${direction * (24 + index * 2)}deg`);
      item.style.setProperty("--spin-b", `${direction * (128 + index * 11)}deg`);
      item.style.setProperty("--spin-c", `${direction * (270 + index * 17)}deg`);
    });

    setIsCollecting(false);
    const animationFrame = window.requestAnimationFrame(() => setIsCollecting(true));
    const timer = window.setTimeout(() => {
      setIsCollecting(false);
      setLayoutSeed((seed) => seed + 1);
    }, 760);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timer);
    };
  }, [copyBurst, copyButtonRef]);

  return <div ref={rootRef} className={`weapon-atmosphere ${isCollecting ? "is-collecting" : ""}`} aria-hidden="true">
    {weighted.map((weapon, index) => {
      const hash = hashName(`${weapon.name}:${layoutSeed}`);
      const layoutType = layoutSeed % WEAPON_LAYOUTS.length;
      const xJitter = ((hash % 17) - 8) * 0.7;
      const yJitter = (((hash >> 5) % 27) - 13) * 1.2;

      let { x, y } = WEAPON_LAYOUTS[layoutType](index, weighted.length, hash, xJitter, yJitter, layoutSeed);

      // Keep moving images inside the visible area above the table.
      x = Math.max(22, Math.min(78, x));
      y = Math.max(45, Math.min(225, y));

      // Logarithmic sizing preserves a visible difference across the weight range.
      const size = variant === "swapper"
        ? (() => {
            const frequencyScale = Math.log1p(weapon.weight) / Math.log1p(Math.max(maxWeight, 8));
            const densityScale = 1 - Math.min(.18, Math.max(0, weighted.length - 1) * (.18 / 14));
            return (210 + frequencyScale * 50) * densityScale;
          })()
        : (() => {
            const logRatio = Math.log1p(weapon.weight) / Math.log1p(maxWeight);
            return 68 + (logRatio ** 1.8) * 220;
          })();
      const rotation = (hash % 31) - 15;
      const opacity = .45;

      const floatPatternIndex = (patternSeed % FLOAT_PATTERN_COUNT) + 1;

      let floatDuration, floatDelay;
      if (WEAPON_ANIMATIONS[floatPatternIndex]) {
        const anim = WEAPON_ANIMATIONS[floatPatternIndex](index, hash);
        floatDuration = anim.duration;
        floatDelay = anim.delay;
      } else {
        floatDuration = 8 + seededRandom(hash) * 12;
        floatDelay = -(seededRandom(hash + 1) * floatDuration);
      }

      const floatRangeX = 15 + seededRandom(hash + 2) * 25;
      const floatRangeY = 10 + seededRandom(hash + 3) * 20;
      const floatRotation = 5 + seededRandom(hash + 4) * 10;

      return <div
        className="weapon-atmosphere-item"
        key={weapon.name}
        style={{
          left: `${x}%`,
          top: `${y}px`,
          width: `${size}px`,
          height: `${Math.max(54, size * .55)}px`,
          "--rotation": `${rotation}deg`,
          "--mix-opacity": opacity,
          "--float-name": `weapon-float-${floatPatternIndex}`,
          "--float-duration": `${floatDuration}s`,
          "--float-delay": `${floatDelay}s`,
          "--float-x": `${floatRangeX}px`,
          "--float-y": `${floatRangeY}px`,
          "--float-rot": `${floatRotation}deg`,
        } as React.CSSProperties}
      >
        <div className="weapon-atmosphere-art">
          <Image src={getWeaponImage(weapon.name)!} alt="" fill sizes="280px" />
        </div>
      </div>;
    })}
  </div>;
}
