import type { PresetRevisionContent, PresetWeaponConfigurationContent } from "./preset-content";
import { sha256Hex } from "@/src/lib/crypto-utils";

export const PRESET_COPY_TARGET_KEY_PATTERN = /^[a-f0-9]{64}$/;

export type PresetCopyManifest = {
  publicationId: string;
  versions: Array<{
    label: string;
    mapPlaylists: Array<string | null>;
    randomizedWeapons: string | null;
    swappers: Array<string | null>;
  }>;
};

type CopyTargetKind = "map_playlist" | "randomized_weapons" | "swapper";

function normalizeEncodedValue(value: string) {
  return value.replace(/\s/g, "");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function randomizedWeaponsPayload(configuration: PresetWeaponConfigurationContent | undefined) {
  if (!configuration || configuration.kind !== "randomized" || configuration.weapons.length === 0) return null;
  return JSON.stringify(configuration.weapons
    .map((weapon) => ({ name: weapon.name.trim(), weight: weapon.weight }))
    .sort((left, right) => compareText(left.name, right.name)));
}

async function copyTargetKey(kind: CopyTargetKind, payload: string | null) {
  if (!payload) return null;
  return sha256Hex(`${kind}\0${payload}`);
}

export async function createPresetCopyManifest(publicationId: string, content: PresetRevisionContent): Promise<PresetCopyManifest> {
  return {
    publicationId,
    versions: await Promise.all(content.versions.map(async (version) => {
      const randomized = version.weaponConfigurations.find((configuration) => configuration.kind === "randomized");
      const swappers = version.weaponConfigurations.filter((configuration) => configuration.kind === "swapper");
      return {
        label: version.label,
        mapPlaylists: await Promise.all(version.mapPlaylists.map((playlist) => copyTargetKey("map_playlist", normalizeEncodedValue(playlist.encodedValue)))),
        randomizedWeapons: await copyTargetKey("randomized_weapons", randomizedWeaponsPayload(randomized)),
        swappers: await Promise.all(swappers.map((swapper) => copyTargetKey("swapper", normalizeEncodedValue(swapper.encodedValue)))),
      };
    })),
  };
}

export function copyTargetKeys(manifest: PresetCopyManifest) {
  const keys = new Set<string>();
  for (const version of manifest.versions) {
    for (const key of version.mapPlaylists) if (key) keys.add(key);
    if (version.randomizedWeapons) keys.add(version.randomizedWeapons);
    for (const key of version.swappers) if (key) keys.add(key);
  }
  return keys;
}
