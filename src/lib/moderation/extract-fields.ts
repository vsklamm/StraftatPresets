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

  const previousFields = extractModeratableFields(previous);
  const directPaths = new Set(["title", "description"]);
  const previousDirect = new Map(previousFields.filter((field) => directPaths.has(field.path)).map((field) => [field.path, field.cleanText]));
  const previousNestedTexts = new Set<string>();

  for (const field of previousFields) {
    if (directPaths.has(field.path)) continue;
    previousNestedTexts.add(`${field.label}\u0000${field.cleanText}`);
  }

  return nextFields.filter((field) => {
    if (directPaths.has(field.path)) return previousDirect.get(field.path) !== field.cleanText;
    const key = `${field.label}\u0000${field.cleanText}`;
    return !previousNestedTexts.has(key);
  });
}
