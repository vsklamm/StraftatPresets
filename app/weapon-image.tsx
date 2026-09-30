import type { CSSProperties } from "react";
import { weaponImageSource, type WeaponImageWidth } from "@/src/domain/weapon-image-sizes";

/** Prebuilt optimized WebP assets: served at specified width (default 128px) across the app. */
export function WeaponImage({ src, alt, width, height, fill, className, imageWidth = 128 }: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
  imageWidth?: WeaponImageWidth;
}) {
  const style: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : undefined;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={weaponImageSource(src, imageWidth)}
    alt={alt} width={width} height={height} style={style} className={className}
    decoding="async" />;
}
