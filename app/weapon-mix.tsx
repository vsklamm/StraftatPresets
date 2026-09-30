"use client";

import { WeaponImage } from "@/app/weapon-image";
import { useEffect, useRef, useState, type RefObject } from "react";
import { getWeaponImage } from "@/src/domain/game-weapons";
import { MAX_SWAPPER_RESULT_WEAPONS } from "@/src/domain/swapper-result-weapons";
import { calculateWeaponChances, type WeightedWeapon } from "@/src/domain/weapon-weights";
import { observeAnimationVisibility } from "@/src/lib/animation-visibility";

const MAX_VISIBLE_WEAPONS = 18;
const X_ANCHORS = [74, 52, 28, 38];
const FLOAT_PATTERN_COUNT = 16;

function hashName(name: string) {
  return [...name].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

type WeaponLayout = (
  index: number,
  count: number,
  hash: number,
  xJitter: number,
  yJitter: number,
  seed: number,
  containerHeight: number,
) => { x: number; y: number };

const WEAPON_LAYOUTS: WeaponLayout[] = [
  // Spiral
  (index, count, hash, xJitter, yJitter, seed, containerHeight) => {
    const angle = index * 2.39996;
    const radiusX = 8 + index * 4.2;
    const radiusY = (8 + index * 8) * (containerHeight / 360);
    const centerY = containerHeight * 0.52;
    return {
      x: 52 + Math.cos(angle) * radiusX + xJitter,
      y: centerY + Math.sin(angle) * radiusY + yJitter,
    };
  },
  // Chevron
  (index, count, hash, xJitter, yJitter, seed, containerHeight) => {
    const wing = index % 2 === 0 ? 1 : -1;
    const step = Math.floor((index + 1) / 2);
    const vStep = 24 * (containerHeight / 360);
    const centerY = containerHeight * 0.52;
    return {
      x: 78 - step * 7.5 + xJitter,
      y: centerY + wing * step * vStep + yJitter,
    };
  },
  // Opposing anchors
  (index, count, hash, xJitter, yJitter, seed, containerHeight) => {
    const centerY = containerHeight * 0.52;
    if (index === 0) return { x: 34 + xJitter * 0.5, y: centerY + yJitter * 0.5 };
    if (index === 1) return { x: 68 + xJitter * 0.5, y: centerY + yJitter * 0.5 };
    const side = index % 2 === 0 ? 20 : 80;
    const vSpan = containerHeight * 0.52;
    const maxSteps = Math.max(1, Math.floor(count / 2));
    const step = Math.floor((index - 2) / 2);
    const heightOffset = (step / maxSteps) * vSpan;
    return { x: side + xJitter, y: containerHeight * 0.26 + heightOffset + yJitter };
  },
  // Center with a surrounding arc
  (index, count, hash, xJitter, yJitter, seed, containerHeight) => {
    const centerY = containerHeight * 0.52;
    const vScale = containerHeight / 360;
    if (index === 0) return { x: 50 + xJitter * 0.2, y: centerY + yJitter * 0.2 };
    if (index <= 5) {
      const arcProgress = (index - 1) / 4;
      const angle = Math.PI * 1.15 + arcProgress * (Math.PI * 0.7);
      return {
        x: 50 + Math.cos(angle) * 28 + xJitter,
        y: centerY + Math.sin(angle) * (80 * vScale) + yJitter,
      };
    }
    return {
      x: 18 + (index * 13) % 62 + xJitter,
      y: (containerHeight * 0.24) + (index * 21) % (containerHeight * 0.55) + yJitter,
    };
  },
  // Scattered grid
  (index, count, hash, xJitter, yJitter, seed, containerHeight) => {
    const placementIndex = count ? (index + seed * 5) % count : index;
    const rowCount = Math.ceil(count / X_ANCHORS.length);
    const row = Math.floor(placementIndex / X_ANCHORS.length);
    const column = placementIndex % X_ANCHORS.length;
    const topMargin = containerHeight * 0.24;
    const rowSpan = containerHeight * 0.56;
    return {
      x: X_ANCHORS[column] + xJitter,
      y: rowCount === 1 ? containerHeight * 0.52 + yJitter : topMargin + row * (rowSpan / Math.max(1, rowCount - 1)) + yJitter,
    };
  },
  // Tilted circular path (3D perspective carousel ring)
  (index, count, hash, xJitter, yJitter, seed, containerHeight) => {
    const centerY = containerHeight * 0.50;
    const vScale = containerHeight / 360;
    const rx = 29;
    const ry = 84 * vScale;
    const baseAngle = (seed * 1.618033) % (2 * Math.PI);
    const angle = baseAngle + (index / Math.max(1, count)) * 2 * Math.PI;
    return {
      x: 50 + Math.cos(angle) * rx + xJitter * 0.25,
      y: centerY + Math.sin(angle) * ry + yJitter * 0.25,
    };
  },
  // 3D figure-eight / infinity trajectory (lemniscate)
  (index, count, hash, xJitter, yJitter, seed, containerHeight) => {
    const centerY = containerHeight * 0.50;
    const vScale = containerHeight / 360;
    const rx = 28;
    const ry = 46 * vScale;
    const baseAngle = (seed * 1.618033) % (2 * Math.PI);
    const u = baseAngle + (index / Math.max(1, count)) * 2 * Math.PI;
    const cx = Math.sin(u);
    const cy = Math.sin(2 * u) * 0.5;
    const env = Math.cos(cx * Math.PI / 2) ** 2;
    const weave = Math.cos(u) * env;
    const weaveY = -15 * weave * vScale;
    return {
      x: 50 + cx * rx + xJitter * 0.2,
      y: centerY + cy * ry + weaveY + yJitter * 0.2,
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
  14: () => ({ duration: 18, delay: 0 }),
  15: () => ({ duration: 26, delay: 0 }),
  16: () => ({ duration: 20, delay: 0 }),
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
  const [atmosphereHeight, setAtmosphereHeight] = useState<number>(380);
  const [atmosphereWidth, setAtmosphereWidth] = useState<number>(600);

  useEffect(() => {
    if (rootRef.current) return observeAnimationVisibility(rootRef.current);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent) return;

    const findTargetSection = () =>
      parent.querySelector<HTMLElement>("#randomizer-settings, #swapper-settings, .preset-section");

    const ATMOSPHERE_TOP_OFFSET = 20;

    const measureDistance = () => {
      const section = findTargetSection();
      if (!section) return;
      const parentRect = parent.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const distance = Math.round(sectionRect.top - parentRect.top + parent.scrollTop - ATMOSPHERE_TOP_OFFSET);
      if (distance > 100) {
        setAtmosphereHeight(distance);
      }
      if (parentRect.width > 100) {
        setAtmosphereWidth(Math.round(parentRect.width));
      }
    };

    measureDistance();
    const frame = window.requestAnimationFrame(measureDistance);

    const observer = new ResizeObserver(measureDistance);
    observer.observe(parent);
    const section = findTargetSection();
    if (section) observer.observe(section);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [weapons, variant]);

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

  const orbitRx = Math.round(Math.min(220, Math.max(120, atmosphereWidth * 0.29)));
  const orbitRy = Math.round(84 * (atmosphereHeight / 360));

  return <div
    ref={rootRef}
    className={`weapon-atmosphere ${isCollecting ? "is-collecting" : ""}`}
    style={{
      "--atmosphere-height": `${atmosphereHeight}px`,
      "--orbit-rx": `${orbitRx}px`,
      "--orbit-ry": `${orbitRy}px`,
      "--lemniscate-rx": `${orbitRx}px`,
      "--lemniscate-ry": `${orbitRy}px`,
      height: `${atmosphereHeight}px`,
    } as React.CSSProperties}
    aria-hidden="true"
  >
    {weighted.map((weapon, index) => {
      const hash = hashName(`${weapon.name}:${layoutSeed}`);
      const layoutType = layoutSeed % WEAPON_LAYOUTS.length;
      const xJitter = ((hash % 17) - 8) * 0.7;
      const yJitter = (((hash >> 5) % 27) - 13) * 1.2;

      const floatPatternIndex = (patternSeed % FLOAT_PATTERN_COUNT) + 1;
      const isLemniscate = floatPatternIndex === 16 || (layoutType === 6 && (patternSeed % 2 === 0)) || (layoutType === 5 && (patternSeed % 4 === 2));
      const isMobius = !isLemniscate && (floatPatternIndex === 15 || (layoutType === 5 && (patternSeed % 4 === 1)));
      const isCarousel = !isLemniscate && !isMobius && (floatPatternIndex === 14 || (layoutType === 5 && (patternSeed % 4 === 0)));

      // Logarithmic sizing preserves a visible difference across the weight range.
      let size = variant === "swapper"
        ? (() => {
            const frequencyScale = Math.log1p(weapon.weight) / Math.log1p(Math.max(maxWeight, 8));
            const densityScale = 1 - Math.min(.15, Math.max(0, weighted.length - 1) * (.15 / 14));
            return (230 + frequencyScale * 65) * densityScale;
          })()
        : (() => {
            const logRatio = Math.log1p(weapon.weight) / Math.log1p(maxWeight);
            return 96 + (logRatio ** 1.5) * 210;
          })();

      let x: number;
      let y: number;
      let rotation = (hash % 31) - 15;
      let opacity = .45;
      let zIndex: number | undefined;
      let floatName = `weapon-float-${floatPatternIndex}`;
      let floatDuration: number;
      let floatDelay: number;
      let floatTiming = "ease-in-out";

      const centerY = atmosphereHeight * 0.50;

      if (isLemniscate) {
        // Active 3D perspective figure-eight / infinity lemniscate trajectory
        x = 50;
        y = centerY;
        floatName = "weapon-float-16";
        floatDuration = 20;
        floatDelay = -((index / Math.max(1, weighted.length)) * floatDuration);
        floatTiming = "linear";
        rotation = (hash % 9) - 4;
      } else if (isMobius) {
        // Active 3D perspective Möbius strip trajectory cycling along the 4π double loop
        x = 50;
        y = centerY;
        floatName = "weapon-float-15";
        floatDuration = 26;
        floatDelay = -((index / Math.max(1, weighted.length)) * floatDuration);
        floatTiming = "linear";
        rotation = (hash % 11) - 5;
      } else if (isCarousel) {
        // Active 3D perspective carousel cycling along the tilted circular ring
        x = 50;
        y = centerY;
        floatName = "weapon-float-14";
        floatDuration = 18;
        floatDelay = -((index / Math.max(1, weighted.length)) * floatDuration);
        floatTiming = "linear";
        rotation = (hash % 15) - 7;
      } else {
        const layoutCoords = WEAPON_LAYOUTS[layoutType](index, weighted.length, hash, xJitter, yJitter, layoutSeed, atmosphereHeight);
        x = layoutCoords.x;
        y = layoutCoords.y;

        // Keep moving images safely inside the visible card bounds without clipping or peeking over borders.
        x = Math.max(18, Math.min(82, x));
        const visualHalfHeight = Math.max(36, (size * 0.55) / 2 + 16);
        const minY = visualHalfHeight + 24;
        const maxY = Math.max(minY, atmosphereHeight - visualHalfHeight - 20);
        y = Math.max(minY, Math.min(maxY, y));

        if (layoutType === 5) {
          // Stationed along tilted circular path: depth scale, layering (z-index), and opacity
          const ry = 84 * (atmosphereHeight / 360);
          const depthFactor = Math.max(-1, Math.min(1, (y - centerY) / Math.max(1, ry)));
          zIndex = Math.round(15 + depthFactor * 12);
          size *= (1 + depthFactor * 0.16);
          opacity = Math.max(0.24, Math.min(0.68, 0.44 + depthFactor * 0.18));
        } else if (layoutType === 6) {
          // Stationed along 3D figure-eight path: depth scale, layering (z-index), and opacity
          const ry = 46 * (atmosphereHeight / 360);
          const depthFactor = Math.max(-1, Math.min(1, (y - centerY) / Math.max(1, ry)));
          zIndex = Math.round(15 + depthFactor * 14);
          size *= (1 + depthFactor * 0.18);
          opacity = Math.max(0.25, Math.min(0.70, 0.45 + depthFactor * 0.20));
        }

        if (WEAPON_ANIMATIONS[floatPatternIndex]) {
          const anim = WEAPON_ANIMATIONS[floatPatternIndex](index, hash);
          floatDuration = anim.duration;
          floatDelay = anim.delay;
        } else {
          floatDuration = 8 + seededRandom(hash) * 12;
          floatDelay = -(seededRandom(hash + 1) * floatDuration);
        }
      }

      const floatRangeX = 12 + seededRandom(hash + 2) * 18;
      const floatRangeY = 6 + seededRandom(hash + 3) * 10;
      const floatRotation = 4 + seededRandom(hash + 4) * 8;

      return <div
        className="weapon-atmosphere-item"
        key={weapon.name}
        style={{
          left: `${x}%`,
          top: `${y}px`,
          zIndex,
          width: `${size}px`,
          height: `${Math.max(64, size * .55)}px`,
          "--rotation": `${rotation}deg`,
          "--mix-opacity": opacity,
          "--float-name": floatName,
          "--float-duration": `${floatDuration}s`,
          "--float-delay": `${floatDelay}s`,
          "--float-timing": floatTiming,
          "--float-x": `${floatRangeX}px`,
          "--float-y": `${floatRangeY}px`,
          "--float-rot": `${floatRotation}deg`,
        } as React.CSSProperties}
      >
        <div className="weapon-atmosphere-art">
          <WeaponImage src={getWeaponImage(weapon.name)!} alt="" fill imageWidth={256} />
        </div>
      </div>;
    })}
  </div>;
}
