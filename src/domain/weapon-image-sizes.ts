import { catalogWeapons, weaponAssetUrl } from "@/src/domain/game-weapons";

// 34–44px tables, up to 94px hovered picker images, and ~238px animated
// square artwork including motion/perspective headroom. Cap at 256 for smooth animations.
export const WEAPON_IMAGE_WIDTHS = [64, 128, 256] as const;
export type WeaponImageWidth = typeof WEAPON_IMAGE_WIDTHS[number] | 512;

export function weaponImageSource(src: string, width: WeaponImageWidth = 128): string {
  return width === 512 ? src : src.replace(/^\/weapons\/([^/?]+\.webp)(?=\?|$)/, `/weapons/${width}/$1`);
}

export function weaponImageSrcSet(src: string): string | undefined {
  if (!/^\/weapons\/[^/?]+\.webp(?:\?|$)/.test(src)) return undefined;
  return WEAPON_IMAGE_WIDTHS.map((width) => `${weaponImageSource(src, width)} ${width}w`).join(", ");
}

let hasPreloadedWeapons = false;

/** Preload all 72 catalog weapon images into browser cache during idle time. */
export function preloadCatalogWeapons(): void {
  if (typeof window === "undefined" || hasPreloadedWeapons) return;
  hasPreloadedWeapons = true;

  const load = () => {
    for (const weapon of catalogWeapons) {
      const img = new window.Image();
      img.decoding = "async";
      if ("fetchPriority" in img) {
        (img as HTMLImageElement & { fetchPriority: string }).fetchPriority = "low";
      }
      img.src = weaponImageSource(weaponAssetUrl(weapon.image), 128);
    }
  };

  const idle = typeof window !== "undefined" && "requestIdleCallback" in window
    ? (window as unknown as { requestIdleCallback: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback
    : undefined;

  if (idle) {
    idle(load, { timeout: 3500 });
  } else {
    setTimeout(load, 1500);
  }
}
