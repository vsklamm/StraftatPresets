import type { StoredThumbnail, ThumbnailStore, ThumbnailUpload } from "@/src/application/ports";

export class R2ThumbnailStore implements ThumbnailStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(presetId: string, upload: ThumbnailUpload) {
    const key = `presets/${presetId}/${crypto.randomUUID()}.${upload.extension}`;
    await this.bucket.put(key, upload.bytes, {
      httpMetadata: {
        contentType: upload.contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { presetId },
    });
    return { key, url: `/api/media/${key}` };
  }

  async get(key: string): Promise<StoredThumbnail | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      cacheControl: object.httpMetadata?.cacheControl,
      etag: object.httpEtag,
    };
  }

  async delete(key: string) {
    await this.bucket.delete(key);
  }
}
