export const PRESET_EVENT_KINDS = ["view", "link_open", "copy"] as const;
export type PresetEventKind = (typeof PRESET_EVENT_KINDS)[number];

export const PRESET_EVENT_POLICY: Record<PresetEventKind, { dedupeMinutes: number; anonymousNetworkDailyLimit: number }> = {
  view: { dedupeMinutes: 30, anonymousNetworkDailyLimit: 30 },
  link_open: { dedupeMinutes: 30, anonymousNetworkDailyLimit: 20 },
  copy: { dedupeMinutes: 5, anonymousNetworkDailyLimit: 24 },
};

export function eventDedupeBucket(kind: PresetEventKind, at: Date | number = Date.now()) {
  const time = at instanceof Date ? at.getTime() : at;
  const duration = PRESET_EVENT_POLICY[kind].dedupeMinutes * 60 * 1_000;
  return Math.floor(time / duration).toString(36);
}

export function eventDayBucket(at: Date | number = Date.now()) {
  const date = at instanceof Date ? at : new Date(at);
  return date.toISOString().slice(0, 10);
}
