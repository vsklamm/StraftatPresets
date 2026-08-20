import { COLOR_AND_FORMAT_TAGS_REGEX } from "@/src/domain/straftat-markup";

export function stripColorAndFormattingTags(text: string): string {
  if (!text) return "";
  return text.replace(COLOR_AND_FORMAT_TAGS_REGEX, "").trim();
}

export function hasColorOrFormattingTags(text: string): boolean {
  if (!text) return false;
  COLOR_AND_FORMAT_TAGS_REGEX.lastIndex = 0;
  return COLOR_AND_FORMAT_TAGS_REGEX.test(text);
}
