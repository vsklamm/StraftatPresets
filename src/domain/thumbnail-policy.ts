export const MAX_THUMBNAIL_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_THUMBNAIL_REQUEST_BYTES = MAX_THUMBNAIL_UPLOAD_BYTES + 512 * 1024;
export const MAX_THUMBNAIL_TARGET_WIDTH = 1280;
export const MAX_THUMBNAIL_TARGET_HEIGHT = 720;
export const THUMBNAIL_TARGET_QUALITY = 82;

export function thumbnailKeysToDeleteAfterDraftSave(
  currentKey: string | null,
  publishedKey: string | null,
  nextKey: string | null,
): string[] {
  return currentKey && currentKey !== nextKey && currentKey !== publishedKey ? [currentKey] : [];
}

export function thumbnailKeysToDeleteAfterPublish(
  previousPublishedKey: string | null,
  nextPublishedKey: string | null,
): string[] {
  return previousPublishedKey && previousPublishedKey !== nextPublishedKey ? [previousPublishedKey] : [];
}
