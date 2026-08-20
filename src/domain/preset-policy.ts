export const MAX_PRESETS_PER_AUTHOR = 4;

export function getPresetLimitMessage(limit = MAX_PRESETS_PER_AUTHOR) {
  return `You have reached the limit of ${limit} presets. Update an existing preset before creating another.`;
}

export class PresetLimitReachedError extends Error {
  readonly limit: number;
  readonly code = "preset_limit_reached";

  constructor(limit = MAX_PRESETS_PER_AUTHOR) {
    super(getPresetLimitMessage(limit));
    this.name = "PresetLimitReachedError";
    this.limit = limit;
  }
}
