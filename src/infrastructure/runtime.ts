import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDatabase } from "@/db";
import { D1Repository } from "@/src/infrastructure/d1-repository";
import { R2ThumbnailStore } from "@/src/infrastructure/r2-thumbnail-store";
import { CloudflareThumbnailProcessor } from "@/src/infrastructure/cloudflare-thumbnail-processor";

export async function getApplicationServices() {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.IMAGES) throw new Error("Cloudflare Images binding is unavailable.");
  return {
    repository: new D1Repository(createDatabase(env.DB)),
    thumbnails: new R2ThumbnailStore(env.THUMBNAILS),
    thumbnailProcessor: new CloudflareThumbnailProcessor(env.IMAGES),
  };
}
