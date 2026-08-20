import type { PresetRevisionContent } from "@/src/domain/preset-content";
import type { ModeratableField } from "./types";
import { hasColorOrFormattingTags, stripColorAndFormattingTags } from "./strip-color-codes";

export function extractModeratableFields(content: PresetRevisionContent): ModeratableField[] {
  const fields: ModeratableField[] = [];

  const addField = (path: string, label: string, rawText: string | undefined | null) => {
    const raw = rawText ?? "";
    const hasColor = hasColorOrFormattingTags(raw);
    const clean = hasColor ? stripColorAndFormattingTags(raw) : raw.trim();
    fields.push({
      path,
      label,
      rawText: raw,
      cleanText: clean,
      hasColorCodes: hasColor,
    });
  };

  addField("title", "Preset Name", content.title);
  addField("description", "Preset Description", content.description);

  content.versions?.forEach((version, versionIndex) => {
    const versionPrefix = `versions.${versionIndex}`;

    version.mapPlaylists?.forEach((playlist, playlistIndex) => {
      const playlistPrefix = `${versionPrefix}.mapPlaylists.${playlistIndex}`;
      addField(`${playlistPrefix}.name`, "Map Playlist Name", playlist.name);
      if (playlist.description) {
        addField(`${playlistPrefix}.description`, "Map Playlist Description", playlist.description);
      }
    });

    version.weaponConfigurations?.forEach((config, configIndex) => {
      const configPrefix = `${versionPrefix}.weaponConfigurations.${configIndex}`;
      addField(`${configPrefix}.name`, `${config.kind === "swapper" ? "Swapper" : "Randomized Weapon"} Name`, config.name);
      if ("description" in config && typeof config.description === "string" && config.description) {
        addField(`${configPrefix}.description`, "Swapper Description", config.description);
      }
    });
  });

  return fields;
}

export function getChangedModeratableFields(
  previous: PresetRevisionContent | null | undefined,
  next: PresetRevisionContent,
): ModeratableField[] {
  const nextFields = extractModeratableFields(next);
  if (!previous) {
    return nextFields;
  }

  const prevFields = extractModeratableFields(previous);
  const prevByPath = new Map<string, ModeratableField>();
  const prevCleanTexts = new Set<string>();

  for (const prevField of prevFields) {
    prevByPath.set(prevField.path, prevField);
    if (prevField.cleanText) {
      prevCleanTexts.add(prevField.cleanText);
    }
  }

  const changedFields: ModeratableField[] = [];

  for (const field of nextFields) {
    const prevField = prevByPath.get(field.path);
    if (prevField) {
      if (field.rawText !== prevField.rawText) {
        changedFields.push(field);
      }
    } else if (!prevCleanTexts.has(field.cleanText)) {
      changedFields.push(field);
    }
  }

  return changedFields;
}
