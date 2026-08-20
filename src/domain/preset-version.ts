export const MIN_PRESET_VERSION = "v0.0.1";
export const MAX_INITIAL_PRESET_VERSION = "v10.0.0";
export const MAX_PRESET_VERSION = "v100.0.0";

export type PresetVersionNumber = readonly [major: number, minor: number, patch: number];

export function parsePresetVersion(value: string): PresetVersionNumber | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.exec(value.trim());
  if (!match) return null;
  const version = [Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : 0] as const;
  return version.every(Number.isSafeInteger) ? version : null;
}

export function comparePresetVersions(left: PresetVersionNumber, right: PresetVersionNumber) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function sortPresetVersionsNewestFirst<T extends { label: string }>(versions: readonly T[]) {
  return [...versions].sort((left, right) => {
    const leftVersion = parsePresetVersion(left.label);
    const rightVersion = parsePresetVersion(right.label);
    if (leftVersion && rightVersion) return comparePresetVersions(rightVersion, leftVersion);
    if (leftVersion) return -1;
    if (rightVersion) return 1;
    return 0;
  });
}

export function isPresetVersionInRange(value: string, maximum = MAX_PRESET_VERSION) {
  const version = parsePresetVersion(value);
  const minimumVersion = parsePresetVersion(MIN_PRESET_VERSION)!;
  const maximumVersion = parsePresetVersion(maximum)!;
  return version !== null && comparePresetVersions(version, minimumVersion) >= 0 && comparePresetVersions(version, maximumVersion) <= 0;
}

export function isPresetVersionInputCandidate(value: string) {
  return /^v?(?:\d+(?:\.(?:\d+(?:\.\d*)?)?)?)?$/.test(value);
}

export function formatPresetVersionLabel(value: string) {
  const version = parsePresetVersion(value);
  if (!version) return value.trim();
  return version[2] === 0 ? `v${version[0]}.${version[1]}` : `v${version[0]}.${version[1]}.${version[2]}`;
}

export function nextPresetVersionLabel(labels: readonly string[]) {
  const versions = labels.map(parsePresetVersion).filter((version): version is PresetVersionNumber => version !== null);
  if (!versions.length) return "v1.0.0";
  const latest = versions.reduce((highest, version) => comparePresetVersions(version, highest) > 0 ? version : highest);
  if (comparePresetVersions(latest, parsePresetVersion(MAX_PRESET_VERSION)!) >= 0) return null;
  return `v${latest[0]}.${latest[1] + 1}.0`;
}
