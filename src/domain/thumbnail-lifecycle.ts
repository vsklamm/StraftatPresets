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
