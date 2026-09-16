import type { ThumbnailProcessor } from "@/src/application/ports";
import { MAX_THUMBNAIL_TARGET_WIDTH, MAX_THUMBNAIL_TARGET_HEIGHT, THUMBNAIL_TARGET_QUALITY } from "@/src/domain/thumbnail-policy";

export class CloudflareThumbnailProcessor implements ThumbnailProcessor {
  constructor(private readonly images: ImagesBinding) {}

  async transform(bytes: Uint8Array) {
    const input = new Blob([bytes as BlobPart]).stream();
    const result = await this.images
      .input(input)
      .transform({ width: MAX_THUMBNAIL_TARGET_WIDTH, height: MAX_THUMBNAIL_TARGET_HEIGHT, fit: "scale-down" })
      .output({ format: "image/webp", quality: THUMBNAIL_TARGET_QUALITY, anim: false });
    if (result.contentType() !== "image/webp") throw new Error("Thumbnail could not be converted to WebP.");
    return new Uint8Array(await result.response().arrayBuffer());
  }
}
