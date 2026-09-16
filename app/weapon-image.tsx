import type { CSSProperties } from "react";
import { weaponImageSource } from "@/src/domain/weapon-image-sizes";

/** Prebuilt optimized WebP assets: served uniformly at 128px across the app. */
export function WeaponImage({ src, alt, width, height, sizes, fill, className }: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
  fill?: boolean;
  className?: string;
}) {
  const style: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : undefined;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={weaponImageSource(src, 128)}
    alt={alt} width={width} height={height} style={style} className={className}
    decoding="async" />;
}
