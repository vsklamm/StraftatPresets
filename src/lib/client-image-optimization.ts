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
export async function optimizeThumbnailForUpload(file: File): Promise<Blob> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const originalWidth = img.naturalWidth || img.width;
      const originalHeight = img.naturalHeight || img.height;

      if (!originalWidth || !originalHeight) {
        resolve(file);
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
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const quality = THUMBNAIL_TARGET_QUALITY / 100;
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
          } else {
            // Fallback to JPEG if WebP export is not supported by environment
            canvas.toBlob(
              (jpegBlob) => resolve(jpegBlob || file),
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
      resolve(file);
    };

    img.src = url;
  });
}
