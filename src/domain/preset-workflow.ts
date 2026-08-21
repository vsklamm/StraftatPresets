import { PRESET_PUBLICATION_RULES } from "@/src/domain/preset-ranking";
import { isSupportedMap, resolveWeaponName } from "@/src/domain/game-catalog";
import { MIN_WEAPON_WEIGHT, MAX_WEAPON_WEIGHT } from "@/src/domain/weapon-weights";
import type { PresetRevisionContent } from "@/src/domain/preset-content";
import {
  comparePresetVersions,
  isPresetVersionInRange,
  MAX_INITIAL_PRESET_VERSION,
  MAX_PRESET_VERSION,
  MIN_PRESET_VERSION,
  parsePresetVersion,
} from "@/src/domain/preset-version";
import {
  CONSONANT_MASH_REGEX,
  MASHING_REGEX,
  runClientModeration,
  stripColorAndFormattingTags,
  UPPERCASE_REGEX,
} from "@/src/lib/moderation";

export type { PresetRevisionContent } from "@/src/domain/preset-content";
export type PresetRevisionStatus = "draft" | "pending" | "rejected" | "published" | "archived" | "superseded";
export type UserPresetState = "draft" | "pending" | "published";
export type PresetEditPlan = "create_initial" | "update_draft" | "fork_working" | "fork_published";

export type PresetIssue = {
  source: "validation" | "moderation";
  field: string;
  code: string;
  message: string;
};

const allowedTransitions: Readonly<Record<PresetRevisionStatus, readonly PresetRevisionStatus[]>> = {
  draft: ["pending", "superseded"],
  pending: ["rejected", "published", "superseded"],
  rejected: ["superseded"],
  published: ["archived"],
  archived: [],
  superseded: [],
};

function canTransitionPresetRevision(from: PresetRevisionStatus, to: PresetRevisionStatus) {
  return allowedTransitions[from].includes(to);
}

export function assertPresetRevisionTransition(from: PresetRevisionStatus, to: PresetRevisionStatus) {
  if (!canTransitionPresetRevision(from, to)) throw new Error(`Invalid preset revision transition: ${from} -> ${to}`);
}

export function deriveUserPresetState(workingStatus: PresetRevisionStatus | null, hasPublishedRevision: boolean): UserPresetState {
  if (workingStatus === "pending") return "pending";
  if (workingStatus === "draft" || workingStatus === "rejected") return "draft";
  if (hasPublishedRevision) return "published";
  throw new Error("Preset has neither a working revision nor a published revision.");
}

export function planPresetEdit(workingStatus: PresetRevisionStatus | null, hasPublishedRevision: boolean): PresetEditPlan {
  if (workingStatus === "draft") return "update_draft";
  if (workingStatus === "pending" || workingStatus === "rejected") return "fork_working";
  if (workingStatus !== null) throw new Error(`Revision ${workingStatus} cannot be the working revision.`);
  return hasPublishedRevision ? "fork_published" : "create_initial";
}

function validationIssue(field: string, code: string, message: string): PresetIssue {
  return { source: "validation", field, code, message };
}

export function validatePresetRevision(content: PresetRevisionContent, options: { isInitialPublication?: boolean } = {}): PresetIssue[] {
  const issues: PresetIssue[] = [];
  const rules = PRESET_PUBLICATION_RULES;

  // Run client moderation (Level 1: limits/placeholders, Level 2: prohibited terms)
  const clientMod = runClientModeration(content);
  for (const flag of clientMod.flags) {
    issues.push({
      source: flag.tier === "hard_reject" ? "moderation" : "validation",
      field: flag.field,
      code: flag.code,
      message: flag.message,
    });
  }

  const titleTrimmed = content.title.trim();
  const cleanTitle = stripColorAndFormattingTags(titleTrimmed);
  if (MASHING_REGEX.test(cleanTitle) || CONSONANT_MASH_REGEX.test(cleanTitle)) {
    issues.push(validationIssue("title", "low_quality_title", "Use a creative name instead of random characters"));
  }

  const descriptionTrimmed = content.description.trim();
  if (MASHING_REGEX.test(descriptionTrimmed) || CONSONANT_MASH_REGEX.test(descriptionTrimmed)) {
    issues.push(validationIssue("description", "low_quality_description", "Use a descriptive summary instead of random characters"));
  }
  if (descriptionTrimmed.length > 10 && /[A-Z]/.test(descriptionTrimmed) && UPPERCASE_REGEX.test(descriptionTrimmed)) {
    issues.push(validationIssue("description", "uppercase_description", "Avoid excessive capitalization"));
  }

  const normalizedTags = content.tags.map((tag) => tag.trim().toLocaleLowerCase("en-US")).filter(Boolean);
  if (normalizedTags.length < rules.minimumTags) issues.push(validationIssue("tags", "too_few_tags", `Choose at least ${rules.minimumTags} tags`));
  if (normalizedTags.length > rules.maximumTags) issues.push(validationIssue("tags", "too_many_tags", `Choose at most ${rules.maximumTags} tags`));
  if (new Set(normalizedTags).size !== normalizedTags.length) issues.push(validationIssue("tags", "duplicate_tags", "Choose each tag only once"));

  if (content.versions.length < rules.minimumVersions) issues.push(validationIssue("versions", "missing_version", "Add a preset version"));
  if (content.versions.length > rules.maximumVersions) issues.push(validationIssue("versions", "too_many_versions", `A preset can have at most ${rules.maximumVersions} versions`));

  const parsedVersions = content.versions.map((version) => parsePresetVersion(version.label));
  const normalizedVersionLabels = content.versions.map((version) => version.label.trim().toLocaleLowerCase("en-US"));
  for (const [versionIndex, version] of content.versions.entries()) {
    const versionField = `versions.${versionIndex}.label`;
    if (!isPresetVersionInRange(version.label)) {
      issues.push(validationIssue(versionField, "invalid_version_label", `Use MAJOR.MINOR.PATCH between ${MIN_PRESET_VERSION} and ${MAX_PRESET_VERSION}`));
    } else if (normalizedVersionLabels.indexOf(normalizedVersionLabels[versionIndex]) !== versionIndex) {
      issues.push(validationIssue(versionField, "duplicate_version_label", `Version ${version.label.trim()} is already in this preset`));
    }
    const previousVersion = parsedVersions[versionIndex - 1];
    const parsedVersion = parsedVersions[versionIndex];
    if (versionIndex > 0 && previousVersion && parsedVersion
      && comparePresetVersions(previousVersion, parsedVersion) < 0) {
      issues.push(validationIssue(versionField, "version_order", "List versions from newest to oldest"));
    }

    if (version.mapPlaylists.length < rules.minimumMapPlaylists) {
      issues.push(validationIssue(`versions.${versionIndex}.mapPlaylists`, "missing_map_playlist", "Add a map playlist"));
    }
    if (version.mapPlaylists.length > rules.maximumMapPlaylists) {
      issues.push(validationIssue(`versions.${versionIndex}.mapPlaylists`, "too_many_map_playlists", `A version can have at most ${rules.maximumMapPlaylists} map playlists`));
    }

    const swappers = version.weaponConfigurations.filter((c) => c.kind === "swapper");
    const randomized = version.weaponConfigurations.filter((c) => c.kind === "randomized");

    if (swappers.length > 0 && randomized.length > 0) {
      issues.push(validationIssue(`versions.${versionIndex}.weaponConfigurations`, "mixed_weapon_configurations", "A version cannot mix randomized weapons and swapper settings"));
    }
    if (swappers.length > rules.maximumSwapperConfigurations) {
      issues.push(validationIssue(`versions.${versionIndex}.weaponConfigurations`, "too_many_swapper_configurations", `A version can have at most ${rules.maximumSwapperConfigurations} swapper settings`));
    }
    if (randomized.length > 1) {
      issues.push(validationIssue(`versions.${versionIndex}.weaponConfigurations`, "too_many_randomized_pools", "A version can have at most 1 randomized weapon pool"));
    }

    for (const [playlistIndex, playlist] of version.mapPlaylists.entries()) {
      const prefix = `versions.${versionIndex}.mapPlaylists.${playlistIndex}`;
      const playlistDescriptionTrimmed = playlist.description.trim();
      if (playlistDescriptionTrimmed) {
        if (MASHING_REGEX.test(playlistDescriptionTrimmed) || CONSONANT_MASH_REGEX.test(playlistDescriptionTrimmed)) issues.push(validationIssue(`${prefix}.description`, "low_quality_playlist_description", "Use a descriptive summary instead of random characters"));
        if (playlistDescriptionTrimmed.length > 10 && /[A-Z]/.test(playlistDescriptionTrimmed) && UPPERCASE_REGEX.test(playlistDescriptionTrimmed)) issues.push(validationIssue(`${prefix}.description`, "uppercase_playlist_description", "Avoid excessive capitalization"));
      }
      if (!playlist.encodedValue.trim()) {
        issues.push(validationIssue(`${prefix}.encodedValue`, "missing_playlist_code", "Add the encoded map playlist"));
        continue;
      }
      const playlistNameTrimmed = playlist.name.trim();
      if (!playlistNameTrimmed) {
        issues.push(validationIssue(`${prefix}.name`, "missing_playlist_name", "The map playlist export has no name"));
      }
      if (!playlist.mapNames.length) issues.push(validationIssue(`${prefix}.mapNames`, "empty_map_playlist", "The map playlist export contains no maps"));
      for (const [mapIndex, mapName] of playlist.mapNames.entries()) {
        if (!isSupportedMap(mapName)) issues.push(validationIssue(`${prefix}.mapNames.${mapIndex}`, "unsupported_map", `Unsupported map: ${mapName}`));
      }
    }
    for (const [configurationIndex, configuration] of version.weaponConfigurations.entries()) {
      const configPrefix = `versions.${versionIndex}.weaponConfigurations.${configurationIndex}`;
      const swapperNameTrimmed = configuration.name.trim();

      if (configuration.kind === "swapper") {
        if (!configuration.encodedValue.trim()) {
          issues.push(validationIssue(`${configPrefix}.encodedValue`, "missing_swapper_code", "Add the encoded swapper settings"));
        } else if (!swapperNameTrimmed) {
          issues.push(validationIssue(`${configPrefix}.encodedValue`, "invalid_swapper_code", "The swapper export is invalid or missing a name"));
        }
        continue;
      }
      if (configuration.kind !== "randomized") continue;
      if (configuration.weapons.length < rules.minimumRandomizedWeapons) {
        issues.push(validationIssue(`${configPrefix}.weapons`, "empty_randomized_pool", "Add at least one weapon to the randomized weapon pool"));
      }
      if (configuration.weapons.length > rules.maximumRandomizedWeapons) {
        issues.push(validationIssue(`${configPrefix}.weapons`, "too_many_weapons", `A randomized weapon pool can have at most ${rules.maximumRandomizedWeapons} weapons`));
      }
      const seenWeapons = new Set<string>();
      for (const [weaponIndex, weapon] of configuration.weapons.entries()) {
        const field = `versions.${versionIndex}.weaponConfigurations.${configurationIndex}.weapons.${weaponIndex}`;
        const canonicalName = resolveWeaponName(weapon.name);
        if (!canonicalName) issues.push(validationIssue(`${field}.name`, "unsupported_weapon", `Unsupported weapon: ${weapon.name}`));
        else if (seenWeapons.has(canonicalName)) issues.push(validationIssue(`${field}.name`, "duplicate_weapon", `Duplicate weapon: ${canonicalName}`));
        else seenWeapons.add(canonicalName);
        if (!Number.isSafeInteger(weapon.weight) || weapon.weight < MIN_WEAPON_WEIGHT || weapon.weight > MAX_WEAPON_WEIGHT) {
          issues.push(validationIssue(`${field}.weight`, "invalid_weapon_weight", `Weapon weight must be an integer between ${MIN_WEAPON_WEIGHT} and ${MAX_WEAPON_WEIGHT}`));
        }
      }
    }
  }
  if (options.isInitialPublication !== false && parsedVersions.length) {
    const startingVersion = parsedVersions.at(-1);
    if (startingVersion && comparePresetVersions(startingVersion, parsePresetVersion(MAX_INITIAL_PRESET_VERSION)!) > 0) {
      issues.push(validationIssue(`versions.${parsedVersions.length - 1}.label`, "initial_version_too_high", `The starting version cannot be higher than ${MAX_INITIAL_PRESET_VERSION}`));
    }
  }
  return issues;
}

export function emptyPresetRevision(title = ""): PresetRevisionContent {
  return { title, description: "", thumbnailKey: null, tags: [], versioningEnabled: false, versions: [] };
}
