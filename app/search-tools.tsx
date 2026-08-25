"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { weaponAssetUrl } from "@/src/domain/game-catalog";
import { TAG_CATEGORIES, type TagCatalogEntry } from "@/src/domain/tag-catalog";

const RADIAL_ORIGIN_X_OFFSET = 18;
const RADIAL_ORIGIN_Y_OFFSET = -18;

export function RadialWeaponPicker({
  weapons,
  onSelect,
  onClose,
  triggerRef,
}: {
  weapons: readonly { name: string; image: string }[];
  onSelect: (name: string) => void;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredWeapon, setHoveredWeapon] = useState<{ name: string; left: number; top: number } | null>(null);
  const [windowSize, setWindowSize] = useState({ width: 1200, height: 800 });

  useEffect(() => {
    function updateSize() {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target) && !triggerRef.current?.contains(target)) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, triggerRef]);

  // Fit below the search bar on laptop-height viewports.
  const dishDimension = useMemo(() => {
    const availableH = Math.max(340, windowSize.height - 140);
    const availableW = Math.max(340, windowSize.width * 0.65);
    return Math.min(520, Math.min(availableH, availableW));
  }, [windowSize]);

  // Calculate ring geometry from the available area and weapon count.
  const { positionedWeapons, ringRadii, imgW, imgH } = useMemo(() => {
    const total = weapons.length;
    if (!total) return { positionedWeapons: [], ringRadii: [], imgW: 44, imgH: 44 };

    const minRadius = Math.max(38, dishDimension * 0.10);
    const maxRadius = dishDimension - 14;
    const Sr = maxRadius - minRadius;
    const r_avg = (minRadius + maxRadius) / 2;

    // Choose enough rings to keep neighboring weapon buttons from overlapping.
    const arcSpanRad = (82 * Math.PI) / 180;
    const targetR2 = (1.1 * total * Sr) / (arcSpanRad * r_avg);
    const numRings = Math.max(4, Math.round((1 + Math.sqrt(1 + 4 * targetR2)) / 2));
    const radialStep = Sr / (numRings - 1);

    const radii: number[] = [];
    for (let k = 0; k < numRings; k++) {
      radii.push(minRadius + k * radialStep);
    }

    const radiusSum = radii.reduce((sum, r) => sum + r, 0);
    const ringCounts = radii.map((r) => Math.max(1, Math.round((total * r) / radiusSum)));

    // Balance to match exact weapon count
    let allocated = ringCounts.reduce((sum, c) => sum + c, 0);
    while (allocated !== total) {
      if (allocated < total) {
        let best = 0;
        for (let i = 1; i < ringCounts.length; i++) {
          if (radii[i] / ringCounts[i] > radii[best] / ringCounts[best]) best = i;
        }
        ringCounts[best]++;
        allocated++;
      } else {
        let best = -1;
        for (let i = 0; i < ringCounts.length; i++) {
          if (ringCounts[i] > 1 && (best === -1 || radii[i] / ringCounts[i] < radii[best] / ringCounts[best])) best = i;
        }
        if (best === -1) break;
        ringCounts[best]--;
        allocated--;
      }
    }

    // Square normalized weapon button size
    const calcImgW = Math.round(radialStep * 1.18 * 1.15);
    const calcImgH = calcImgW;

    const originX = dishDimension + RADIAL_ORIGIN_X_OFFSET;
    const originY = RADIAL_ORIGIN_Y_OFFSET;

    const sliceOffsets = ringCounts.reduce<number[]>((acc, count, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + ringCounts[i - 1]);
      return acc;
    }, []);

    const items = ringCounts.flatMap((count, ringIdx) => {
      const offset = sliceOffsets[ringIdx];
      const ringWeapons = weapons.slice(offset, offset + count);
      const radius = radii[ringIdx];
      const isOdd = ringIdx % 2 === 1;

      // Tight, symmetrical angular padding
      const padStartDeg = Math.asin(Math.min(0.85, (calcImgW / 2 + 1) / radius)) * (180 / Math.PI);
      const padEndDeg = Math.asin(Math.min(0.85, (calcImgH / 2 + 1) / radius)) * (180 / Math.PI);
      const startDeg = 90 + padStartDeg;
      const endDeg = 180 - padEndDeg;
      const spanDeg = Math.max(10, endDeg - startDeg);

      return ringWeapons.map((weapon, idx) => {
        let angleDeg: number;
        if (count === 1) {
          angleDeg = (startDeg + endDeg) / 2;
        } else {
          const stepDeg = spanDeg / count;
          const phase = isOdd ? stepDeg * 0.75 : stepDeg * 0.25;
          angleDeg = startDeg + phase + idx * stepDeg;
        }
        const angleRad = (angleDeg * Math.PI) / 180;

        const x = originX + radius * Math.cos(angleRad);
        const y = originY + radius * Math.sin(angleRad);

        // Slide-in animation along the arc
        const prevRad = ((angleDeg - 20) * Math.PI) / 180;
        const slideDx = radius * Math.cos(prevRad) - radius * Math.cos(angleRad);
        const slideDy = radius * Math.sin(prevRad) - radius * Math.sin(angleRad);

        return {
          weapon,
          x,
          y,
          slideDx,
          slideDy,
          delay: ringIdx * 18 + idx * 4,
          radius,
        };
      });
    });

    return { positionedWeapons: items, ringRadii: radii, imgW: calcImgW, imgH: calcImgH };
  }, [weapons, dishDimension]);

  const originX = dishDimension + RADIAL_ORIGIN_X_OFFSET;
  const originY = RADIAL_ORIGIN_Y_OFFSET;
  const hoverScale = 1.55;
  const hoveredPosition = hoveredWeapon
    ? positionedWeapons.find((item) => item.weapon.name === hoveredWeapon.name)
    : null;

  return (
    <div
      ref={containerRef}
      className="radial-weapon-picker"
      style={{ width: `${dishDimension}px`, height: `${dishDimension}px`, borderBottomLeftRadius: `${dishDimension}px` }}
      role="dialog"
      aria-label="Weapon radial picker"
    >
      <svg className="radial-guide-tracks" viewBox={`0 0 ${dishDimension} ${dishDimension}`} aria-hidden="true">
        {ringRadii.map((radius) => (
          <path
            key={radius}
            d={`M ${originX} ${originY + radius} A ${radius} ${radius} 0 0 1 ${originX - radius} ${originY}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.035)"
            strokeDasharray="3 4"
          />
        ))}
      </svg>

      <div className="radial-items-container">
        {positionedWeapons.map(({ weapon, x, y, slideDx, slideDy, delay }) => {
          let repelX = 0;
          let repelY = 0;
          if (hoveredPosition && hoveredPosition.weapon.name !== weapon.name) {
            const dx = x - hoveredPosition.x;
            const dy = y - hoveredPosition.y;
            const dist = Math.hypot(dx, dy);
            const repelRadius = imgW * 2.4;
            if (dist > 0 && dist < repelRadius) {
              const force = Math.pow(1 - dist / repelRadius, 1.4) * 14;
              repelX = (dx / dist) * force;
              repelY = (dy / dist) * force;
            }
          }

          return (
            <button
              key={weapon.name}
              type="button"
              className="radial-weapon-btn"
              style={
                {
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${imgW}px`,
                  height: `${imgH}px`,
                  "--slide-dx": `${slideDx}px`,
                  "--slide-dy": `${slideDy}px`,
                  "--hover-scale": hoverScale,
                  "--repel-x": `${repelX.toFixed(1)}px`,
                  "--repel-y": `${repelY.toFixed(1)}px`,
                  animationDelay: `${delay}ms`,
                } as React.CSSProperties
              }
              onMouseEnter={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setHoveredWeapon({ name: weapon.name, left: bounds.left + bounds.width / 2, top: bounds.top - 5 });
              }}
              onMouseLeave={() => setHoveredWeapon(null)}
              onClick={() => {
                onSelect(weapon.name);
              }}
              aria-label={weapon.name}
            >
              <Image src={weaponAssetUrl(weapon.image)} alt={weapon.name} width={imgW} height={imgH} className="radial-weapon-img" />
            </button>
          );
        })}
      </div>
      {hoveredWeapon && typeof document !== "undefined" ? createPortal(
        <span className="radial-item-tooltip" style={{ left: hoveredWeapon.left, top: hoveredWeapon.top }}>{hoveredWeapon.name}</span>,
        document.body,
      ) : null}
    </div>
  );
}

export function SearchTagPicker({
  tags,
  onSelect,
  onClose,
}: {
  tags: readonly TagCatalogEntry[];
  onSelect: (label: string) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return (
    <div ref={containerRef} className="search-tag-picker" role="dialog" aria-label="Tag filter picker">
      <div className="search-tag-categories">
        {TAG_CATEGORIES.map((category) => {
          const categoryTags = tags.filter((tag) => tag.category === category);
          if (!categoryTags.length) return null;
          return (
            <div key={category} className="search-tag-group">
              <span className="search-tag-group-title">{category}</span>
              <div className="search-tag-group-list">
                {categoryTags.map((tag) => (
                  <button
                    key={tag.slug}
                    type="button"
                    className="search-tag-pill"
                    onClick={() => {
                      onSelect(tag.label);
                    }}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
