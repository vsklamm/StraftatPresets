import { stripColorAndFormattingTags } from "@/src/lib/moderation/strip-color-codes";

export function slugifyPresetTitle(title: string, id: string): string {
  const cleanTitle = stripColorAndFormattingTags(title);
  const base = cleanTitle
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "preset";
  const shortId = id.replace(/-/g, "").slice(0, 7);
  return `${base}-${shortId}`;
}
