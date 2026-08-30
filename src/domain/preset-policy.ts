export const DEFAULT_PRESET_LIMIT = 4;
export const ELEVATED_PRESET_LIMIT = 15;
export const PRESET_LIMIT_UPGRADE_THRESHOLD = 3;
export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function getPresetLimitMessage(limit = DEFAULT_PRESET_LIMIT) {
  return `You have reached the limit of ${limit} presets. Update an existing preset before creating another.`;
}

export class PresetLimitReachedError extends Error {
  readonly limit: number;
  readonly code = "preset_limit_reached";

  constructor(limit = DEFAULT_PRESET_LIMIT) {
    super(getPresetLimitMessage(limit));
    this.name = "PresetLimitReachedError";
    this.limit = limit;
  }
}
