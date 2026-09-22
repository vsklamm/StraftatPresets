import { stripColorAndFormattingTags } from "@/src/domain/straftat-markup";

export const MIN_USER_DISPLAY_NAME_VISIBLE_CHARACTERS = 2;
export const MAX_USER_DISPLAY_NAME_VISIBLE_CHARACTERS = 32;
export const MAX_USER_DISPLAY_NAME_CHARACTERS = 400;
const USER_DISPLAY_NAME_COLOR_TAG_REGEX = /<#[0-9a-fA-F]{3,8}>|<color=(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]+)>|<\/color>/gi;

export type UserProfile = {
  displayName: string;
  hasCustomDisplayName: boolean;
  hasConfiguredDisplayName: boolean;
  presetLimit: number;
};

export type UserDisplayNameValidation =
  | { displayName: string | null; visibleName: string }
  | { error: string };

export class DisplayNameAlreadyUsedError extends Error {}

function isWithinOneDamerauLevenshteinEdit(first: string[], second: string[]): boolean {
  if (Math.abs(first.length - second.length) > 1) return false;
  let twoRowsBack: number[] = [];
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);

  for (let row = 1; row <= first.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= second.length; column += 1) {
      let distance = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + Number(first[row - 1] !== second[column - 1]),
      );
      if (row > 1 && column > 1 && first[row - 1] === second[column - 2] && first[row - 2] === second[column - 1]) {
        distance = Math.min(distance, twoRowsBack[column - 2] + 1);
      }
      current[column] = distance;
    }
    if (Math.min(...current) > 1) return false;
    twoRowsBack = previous;
    previous = current;
  }
  return previous[second.length] <= 1;
}

export function namesConflict(candidate: string, existing: string): boolean {
  const first = normalizeUserDisplayName(stripColorAndFormattingTags(candidate)).toLowerCase();
  const second = normalizeUserDisplayName(stripColorAndFormattingTags(existing)).toLowerCase();
  if (first === second) return true;

  const a = Array.from(first);
  const b = Array.from(second);
  if (Math.min(a.length, b.length) < 6) return false;
  return isWithinOneDamerauLevenshteinEdit(a, b);
}

export function normalizeUserDisplayName(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function validateUserDisplayNameStructure(value: string): UserDisplayNameValidation {
  const displayName = normalizeUserDisplayName(value);
  if (!displayName) return { displayName: null, visibleName: "" };
  if (displayName.length > MAX_USER_DISPLAY_NAME_CHARACTERS) {
    return { error: "Display name contains too much formatting." };
  }
  if (/\p{C}/u.test(displayName)) {
    return { error: "Use a single-line display name." };
  }
  if (/[<>]/u.test(displayName.replace(USER_DISPLAY_NAME_COLOR_TAG_REGEX, ""))) {
    return { error: "Only TMPro color tags are supported." };
  }

  const visibleName = stripColorAndFormattingTags(displayName).replace(/\s+/gu, " ").trim();
  const visibleCharacters = Array.from(visibleName).length;
  if (visibleCharacters < MIN_USER_DISPLAY_NAME_VISIBLE_CHARACTERS || visibleCharacters > MAX_USER_DISPLAY_NAME_VISIBLE_CHARACTERS) {
    return { error: `Use ${MIN_USER_DISPLAY_NAME_VISIBLE_CHARACTERS}–${MAX_USER_DISPLAY_NAME_VISIBLE_CHARACTERS} visible characters.` };
  }
  return { displayName, visibleName };
}
