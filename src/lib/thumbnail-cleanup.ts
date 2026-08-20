import type { ThumbnailStore } from "@/src/application/ports";

export async function cleanupThumbnailKeys(
  thumbnails: ThumbnailStore,
  keys: readonly string[] | undefined,
  operation: string,
): Promise<void> {
  for (const key of new Set(keys ?? [])) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await thumbnails.delete(key);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) console.error(`${operation}: thumbnail cleanup failed`, { key, error: lastError });
  }
}
