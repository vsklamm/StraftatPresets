import { z } from "zod";
import { MIN_WEAPON_WEIGHT, MAX_WEAPON_WEIGHT } from "@/src/domain/weapon-weights";
import { supportedWeaponCount } from "@/src/domain/game-catalog";
import { MAX_PRESET_TAGS } from "@/src/domain/tag-policy";

export const MAX_PRESET_TITLE_CHARACTERS = 500;
export const MAX_PRESET_TITLE_SYMBOLS = 70;
export const MAX_PLAYLIST_NAME_CHARACTERS = 500;
export const MAX_PLAYLIST_NAME_SYMBOLS = 70;
export const MAX_SWAPPER_NAME_CHARACTERS = 500;
export const MAX_SWAPPER_NAME_SYMBOLS = 70;
export const MAX_PRESET_DESCRIPTION_CHARACTERS = 500;
export const MAX_PRESET_DESCRIPTION_LINES = 10;
export const MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS = 160;
export const MAX_PRESET_VERSIONS = 20;
export const MIN_MAP_PLAYLISTS = 1;
export const MAX_MAP_PLAYLISTS = 7;
export const MAX_SWAPPER_CONFIGURATIONS = 7;
export const MIN_RANDOMIZED_WEAPONS = 1;
export const MAX_RANDOMIZED_WEAPONS = supportedWeaponCount;

const NEWLINE_REGEX = /\r\n|[\r\n\u2028\u2029\u000B\u000C\u0085]/g;

function normalizeNewlines(text: string): string {
  return text.replace(NEWLINE_REGEX, "\n");
}

export function countTextLines(text: string): number {
  if (!text) return 0;
  return normalizeNewlines(text).split("\n").length;
}

export function hasConsecutiveEmptyLines(text: string): boolean {
  if (!text) return false;
  const lines = normalizeNewlines(text).split("\n");
  let emptyCount = 0;
  for (const line of lines) {
    if (line.trim().length === 0) {
      emptyCount++;
      if (emptyCount >= 2) return true;
    } else {
      emptyCount = 0;
    }
  }
  return false;
}

const shortText = (maximum: number) => z.string().max(maximum);

const mapPlaylistSchema = z.object({
  name: shortText(MAX_PLAYLIST_NAME_CHARACTERS),
  description: shortText(MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS),
  encodedValue: shortText(500_000),
  mapNames: z.array(shortText(120)).max(500),
}).strict();

const randomizedConfigurationSchema = z.object({
  kind: z.literal("randomized"),
  name: shortText(MAX_SWAPPER_NAME_CHARACTERS),
  weapons: z.array(z.object({
    name: shortText(120),
    weight: z.number().int().min(MIN_WEAPON_WEIGHT).max(MAX_WEAPON_WEIGHT),
  }).strict()).max(MAX_RANDOMIZED_WEAPONS),
}).strict();

const swapperConfigurationSchema = z.object({
  kind: z.literal("swapper"),
  name: shortText(MAX_SWAPPER_NAME_CHARACTERS),
  description: shortText(MAX_MAP_PLAYLIST_DESCRIPTION_CHARACTERS).optional(),
  encodedValue: shortText(500_000),
}).strict();

const presetVersionSchema = z.object({
  label: shortText(40),
  mapPlaylists: z.array(mapPlaylistSchema).max(MAX_MAP_PLAYLISTS),
  weaponConfigurations: z.array(z.discriminatedUnion("kind", [randomizedConfigurationSchema, swapperConfigurationSchema])).max(MAX_SWAPPER_CONFIGURATIONS),
}).strict();

export const presetRevisionContentSchema = z.object({
  title: shortText(MAX_PRESET_TITLE_CHARACTERS),
  description: shortText(MAX_PRESET_DESCRIPTION_CHARACTERS),
  thumbnailKey: z.string().max(500).nullable(),
  tags: z.array(shortText(80)).max(MAX_PRESET_TAGS),
  versions: z.array(presetVersionSchema).max(MAX_PRESET_VERSIONS),
}).strict();

export type PresetRevisionContent = z.infer<typeof presetRevisionContentSchema>;
export type PresetMapPlaylistContent = z.infer<typeof mapPlaylistSchema>;
export type PresetWeaponConfigurationContent = z.infer<typeof randomizedConfigurationSchema> | z.infer<typeof swapperConfigurationSchema>;
export type PresetVersionContent = z.infer<typeof presetVersionSchema>;

import { comparePresetVersions, parsePresetVersion, type PresetVersionNumber, sortPresetVersionsNewestFirst } from "./preset-version";

export function createEmptyMapPlaylist(): PresetMapPlaylistContent {
  return { name: "", description: "", encodedValue: "", mapNames: [] };
}

export function findPreviousPresetVersion<T extends { label: string }>(
  targetLabel: string,
  versions: readonly T[]
): T | undefined {
  const targetVersion = parsePresetVersion(targetLabel);
  if (!targetVersion) return undefined;

  const candidates = versions
    .map((v) => ({ item: v, parsed: parsePresetVersion(v.label) }))
    .filter((entry): entry is { item: T; parsed: PresetVersionNumber } =>
      entry.parsed !== null && comparePresetVersions(entry.parsed, targetVersion) < 0
    )
    .sort((a, b) => comparePresetVersions(b.parsed, a.parsed));

  return candidates[0]?.item;
}

export function createPresetVersionFromPrevious(
  label: string,
  previousVersion?: PresetVersionContent
): PresetVersionContent {
  if (!previousVersion) {
    return {
      label,
      mapPlaylists: [createEmptyMapPlaylist()],
      weaponConfigurations: [{ kind: "randomized", name: "Randomized weapons", weapons: [] }],
    };
  }

  const playlistCount = Math.max(1, previousVersion.mapPlaylists?.length || 1);
  const mapPlaylists = Array.from({ length: playlistCount }, () => createEmptyMapPlaylist());

  const prevRandomized = previousVersion.weaponConfigurations?.find((c) => c.kind === "randomized");
  const prevSwapperConfigs = previousVersion.weaponConfigurations?.filter((c) => c.kind === "swapper") ?? [];

  let weaponConfigurations: PresetWeaponConfigurationContent[] = [];
  if (prevRandomized && prevRandomized.weapons.length > 0) {
    weaponConfigurations = [
      {
        kind: "randomized",
        name: prevRandomized.name || "Randomized weapons",
        weapons: prevRandomized.weapons.map((w) => ({ name: w.name, weight: w.weight })),
      },
    ];
  } else if (prevSwapperConfigs.length > 0) {
    weaponConfigurations = Array.from({ length: prevSwapperConfigs.length }, () => ({
      kind: "swapper",
      name: "",
      encodedValue: "",
    }));
  } else if (prevRandomized) {
    weaponConfigurations = [{ kind: "randomized", name: "Randomized weapons", weapons: [] }];
  } else {
    weaponConfigurations = [];
  }

  return {
    label,
    mapPlaylists,
    weaponConfigurations,
  };
}

export function createStarterPresetContent(title = ""): PresetRevisionContent {
  return {
    title,
    description: "",
    thumbnailKey: null,
    tags: [],
    versions: [{
      label: "v1.0.0",
      mapPlaylists: [createEmptyMapPlaylist()],
      weaponConfigurations: [],
    }],
  };
}

export function normalizePresetContent(content: PresetRevisionContent): PresetRevisionContent {
  return {
    ...content,
    versions: content.versions.length ? sortPresetVersionsNewestFirst(content.versions) : createStarterPresetContent(content.title).versions,
  };
}

export function parsePresetRevisionContent(value: unknown) {
  return presetRevisionContentSchema.parse(value);
}

export function formatCardDescriptionPreview(description: string): string {
  if (!description) return "";
  const paragraphs = normalizeNewlines(description)
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  if (paragraphs.length === 0) return "";
  const first = paragraphs[0];
  if (first.length >= 40 || paragraphs.length === 1) {
    return first;
  }
  return `${first} ${paragraphs[1]}`;
}
