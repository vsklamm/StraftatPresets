import {
  MAX_THUMBNAIL_TARGET_WIDTH,
  MAX_THUMBNAIL_TARGET_HEIGHT,
  THUMBNAIL_TARGET_QUALITY,
} from "@/src/domain/thumbnail-policy";

/**
 * Optimizes an image file locally in the browser:
 * - Proportionally scales down to fit within MAX_THUMBNAIL_TARGET_WIDTH x MAX_THUMBNAIL_TARGET_HEIGHT.
 * - Does NOT upscale images smaller than the target bounds.
 * - Converts to WebP format (falling back to JPEG if WebP canvas export fails).
 * - Compresses with THUMBNAIL_TARGET_QUALITY.
 */
export type DetectedFocalPoint = { x: number; y: number };

export function detectOptimalThumbnailFocalPoint(
  imageSource: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }
): DetectedFocalPoint {
  try {
  const { data, width, height } = imageSource;
  if (width < 3 || height < 3) return { x: 50, y: 50 };

  const energyX = new Float32Array(width);
  let totalEnergy = 0;

  // Grayscale luminance
  const luminance = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luminance[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Gradients
  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      const dx = Math.abs(luminance[idx + 1] - luminance[idx - 1]);
      const dy = Math.abs(luminance[idx + width] - luminance[idx - width]);

      const pixelOffset = idx * 4;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const satWeight = 1 + (saturation / 255) * 0.5;

      const energy = (dx + dy) * satWeight;
      energyX[x] += energy;
      totalEnergy += energy;
    }
  }

  const avgEnergyPerColumn = totalEnergy / Math.max(1, width - 2);
  if (avgEnergyPerColumn < 1) {
    return { x: 50, y: 50 };
  }

  // Moving average smoothing window (~8% of width)
  const smoothRadius = Math.max(2, Math.floor(width * 0.08));
  const smoothedX = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, x - smoothRadius); k <= Math.min(width - 1, x + smoothRadius); k++) {
      sum += energyX[k];
      count++;
    }
    smoothedX[x] = count > 0 ? sum / count : 0;
  }

  // Analyze Left (0-40%), Center (35-65%), and Right (60-100%) zones
  const leftEnd = Math.floor(width * 0.40);
  const rightStart = Math.floor(width * 0.60);

  let leftPeakVal = 0, leftPeakX = Math.floor(width * 0.20);
  let rightPeakVal = 0, rightPeakX = Math.floor(width * 0.80);
  let centerPeakVal = 0;

  let leftEnergy = 0;
  let rightEnergy = 0;
  let centerEnergy = 0;

  for (let x = 0; x < width; x++) {
    const val = smoothedX[x];
    if (x <= leftEnd) {
      leftEnergy += val;
      if (val > leftPeakVal) {
        leftPeakVal = val;
        leftPeakX = x;
      }
    }
    if (x >= Math.floor(width * 0.35) && x <= Math.floor(width * 0.65)) {
      centerEnergy += val;
      if (val > centerPeakVal) {
        centerPeakVal = val;
      }
    }
    if (x >= rightStart) {
      rightEnergy += val;
      if (val > rightPeakVal) {
        rightPeakVal = val;
        rightPeakX = x;
      }
    }
  }

  const significanceThreshold = avgEnergyPerColumn * 1.30;
  const isLeftSignificant = leftPeakVal >= significanceThreshold && leftEnergy > centerEnergy * 0.85;
  const isRightSignificant = rightPeakVal >= significanceThreshold && rightEnergy > centerEnergy * 0.85;

  let chosenFocalXPercent = 50;

  if (isLeftSignificant && isRightSignificant) {
    // 2 prominent focal points: pick a random one
    const pickLeft = Math.random() < 0.5;
    if (pickLeft) {
      const peakPercent = (leftPeakX / width) * 100;
      chosenFocalXPercent = Math.max(15, Math.min(32, peakPercent));
    } else {
      const peakPercent = (rightPeakX / width) * 100;
      chosenFocalXPercent = Math.min(85, Math.max(68, peakPercent));
    }
  } else if (isLeftSignificant && !isRightSignificant && leftPeakVal > centerPeakVal * 1.15) {
    // 1 prominent left-shifted focal point
    const peakPercent = (leftPeakX / width) * 100;
    chosenFocalXPercent = Math.max(15, Math.min(32, peakPercent));
  } else if (isRightSignificant && !isLeftSignificant && rightPeakVal > centerPeakVal * 1.15) {
    // 1 prominent right-shifted focal point
    const peakPercent = (rightPeakX / width) * 100;
    chosenFocalXPercent = Math.min(85, Math.max(68, peakPercent));
  } else {
    chosenFocalXPercent = 50;
  }

  return {
    x: Math.round(chosenFocalXPercent * 10) / 10,
    y: 50,
  };
  } catch {
    return { x: 50, y: 50 };
  }
}

export type OptimizedThumbnailResult = {
  blob: Blob;
  position: DetectedFocalPoint;
};

/**
 * Optimizes an image file locally in the browser:
 * - Proportionally scales down to fit within MAX_THUMBNAIL_TARGET_WIDTH x MAX_THUMBNAIL_TARGET_HEIGHT.
 * - Detects optimal focal position using Sobel energy.
 * - Converts to WebP format (falling back to JPEG if WebP canvas export fails).
 * - Compresses with THUMBNAIL_TARGET_QUALITY.
 */
export async function optimizeThumbnailForUpload(file: File): Promise<OptimizedThumbnailResult> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return { blob: file, position: { x: 50, y: 50 } };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const originalWidth = img.naturalWidth || img.width;
      const originalHeight = img.naturalHeight || img.height;

      if (!originalWidth || !originalHeight) {
        resolve({ blob: file, position: { x: 50, y: 50 } });
        return;
      }

      // Calculate scale factor without upscaling
      const scale = Math.min(1, MAX_THUMBNAIL_TARGET_WIDTH / originalWidth, MAX_THUMBNAIL_TARGET_HEIGHT / originalHeight);
      const targetWidth = Math.max(1, Math.round(originalWidth * scale));
      const targetHeight = Math.max(1, Math.round(originalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ blob: file, position: { x: 50, y: 50 } });
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Detect focal point from downscaled canvas pixels
      let position: DetectedFocalPoint = { x: 50, y: 50 };
      try {
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        position = detectOptimalThumbnailFocalPoint(imageData);
      } catch {
        // Fall back to center on getImageData security/buffer error
        position = { x: 50, y: 50 };
      }

      const quality = THUMBNAIL_TARGET_QUALITY / 100;
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve({ blob, position });
          } else {
            // Fallback to JPEG if WebP export is not supported by environment
            canvas.toBlob(
              (jpegBlob) => resolve({ blob: jpegBlob || file, position }),
              "image/jpeg",
              quality
            );
          }
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ blob: file, position: { x: 50, y: 50 } });
    };

    img.src = url;
  });
}
