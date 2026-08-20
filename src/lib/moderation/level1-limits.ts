import { PRESET_PUBLICATION_RULES } from "@/src/domain/preset-ranking";
import {
  MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS,
  MAX_PRESET_DESCRIPTION_CHARACTERS,
  MAX_PRESET_DESCRIPTION_LINES,
  countTextLines,
  hasConsecutiveEmptyLines,
} from "@/src/domain/preset-content";
import type { ModeratableField, ModerationFlag, ModerationResult } from "./types";

export function checkLevel1Limits(fields: ModeratableField[]): ModerationResult {
  const flags: ModerationFlag[] = [];

  for (const field of fields) {
    const { path, cleanText } = field;

    if (path === "title") {
      if (cleanText.length < PRESET_PUBLICATION_RULES.minimumTitleCharacters) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "title_too_short",
          message: `Add a preset name (at least ${PRESET_PUBLICATION_RULES.minimumTitleCharacters} characters)`,
        });
      }
      if (cleanText.length > PRESET_PUBLICATION_RULES.maximumTitleSymbols) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "title_too_long",
          message: `Preset name must be ${PRESET_PUBLICATION_RULES.maximumTitleSymbols} characters or fewer`,
        });
      }
      if (field.rawText.length > PRESET_PUBLICATION_RULES.maximumTitleCharacters) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "title_raw_too_long",
          message: `Preset name cannot exceed ${PRESET_PUBLICATION_RULES.maximumTitleCharacters} characters`,
        });
      }
      const lower = cleanText.toLowerCase();
      if (lower === "untitled" || lower === "untitled preset" || lower === "untitled name") {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "invalid_title",
          message: "Use a creative name instead of Untitled",
        });
      } else if (lower === "creative name") {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "invalid_title",
          message: "Choose a specific preset name",
        });
      } else if (lower === "creative name 2") {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "invalid_title",
          message: "Choose a specific preset name",
        });
      }
    } else if (path === "description") {
      if (cleanText.length < PRESET_PUBLICATION_RULES.minimumDescriptionCharacters) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "description_too_short",
          message: `Add a description of at least ${PRESET_PUBLICATION_RULES.minimumDescriptionCharacters} characters`,
        });
      }
      if (cleanText.length > MAX_PRESET_DESCRIPTION_CHARACTERS) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "description_too_long",
          message: `Preset description must be ${MAX_PRESET_DESCRIPTION_CHARACTERS} characters or fewer`,
        });
      }
      if (countTextLines(cleanText) > MAX_PRESET_DESCRIPTION_LINES) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "description_too_many_lines",
          message: `Preset description must be ${MAX_PRESET_DESCRIPTION_LINES} lines or fewer`,
        });
      }
      if (hasConsecutiveEmptyLines(cleanText)) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "description_consecutive_empty_lines",
          message: "Preset description cannot contain consecutive empty lines",
        });
      }
    } else if (path.includes(".mapPlaylists.") && path.endsWith(".description")) {
      if (cleanText.length > MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "playlist_description_too_long",
          message: `Playlist description must be ${MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS} characters or fewer`,
        });
      }
    } else if (path.includes(".weaponConfigurations.") && path.endsWith(".description")) {
      if (cleanText.length > MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "swapper_description_too_long",
          message: `Swapper description must be ${MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS} characters or fewer`,
        });
      }
    } else if (path.includes(".mapPlaylists.") && path.endsWith(".name")) {
      if (cleanText.length > PRESET_PUBLICATION_RULES.maximumPlaylistNameSymbols) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "playlist_name_too_long",
          message: `Map playlist name must be ${PRESET_PUBLICATION_RULES.maximumPlaylistNameSymbols} characters or fewer`,
        });
      }
      if (field.rawText.length > PRESET_PUBLICATION_RULES.maximumPlaylistNameCharacters) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "playlist_name_raw_too_long",
          message: `Map playlist name cannot exceed ${PRESET_PUBLICATION_RULES.maximumPlaylistNameCharacters} characters`,
        });
      }
    } else if (path.includes(".weaponConfigurations.") && path.endsWith(".name")) {
      if (cleanText.length > PRESET_PUBLICATION_RULES.maximumSwapperNameSymbols) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "swapper_name_too_long",
          message: `Swapper name must be ${PRESET_PUBLICATION_RULES.maximumSwapperNameSymbols} characters or fewer`,
        });
      }
      if (field.rawText.length > PRESET_PUBLICATION_RULES.maximumSwapperNameCharacters) {
        flags.push({
          level: 1,
          tier: "limits",
          field: path,
          code: "swapper_name_raw_too_long",
          message: `Swapper name cannot exceed ${PRESET_PUBLICATION_RULES.maximumSwapperNameCharacters} characters`,
        });
      }
    }
  }

  return {
    decision: flags.length === 0 ? "approved" : "rejected",
    level: 1,
    flags,
    summary: flags.length === 0 ? "Passed field limit checks" : `Failed limits check with ${flags.length} issue(s)`,
  };
}
