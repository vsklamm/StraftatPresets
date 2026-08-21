"use client";

import { PRESET_EVENT_POLICY, type PresetEventKind } from "@/src/domain/preset-events";

const LOCAL_THROTTLE_PREFIX = "straftat-preset-event:";

function claimThrottle(presetId: string, kind: PresetEventKind) {
  if (typeof window === "undefined") return undefined;
  const key = `${LOCAL_THROTTLE_PREFIX}${presetId}:${kind}`;
  const now = Date.now();
  try {
    const previous = Number(window.localStorage.getItem(key) ?? 0);
    if (now - previous < PRESET_EVENT_POLICY[kind].dedupeMinutes * 60 * 1_000) return undefined;
    window.localStorage.setItem(key, String(now));
  } catch {
    return "";
  }
  return key;
}

export async function recordPresetInteraction(presetId: string, kind: PresetEventKind, onAccepted?: () => void) {
  const throttleKey = claimThrottle(presetId, kind);
  if (throttleKey === undefined) return undefined;
  onAccepted?.();
  try {
    const response = await fetch(`/api/presets/${encodeURIComponent(presetId)}/events`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: crypto.randomUUID(), kind }),
    });
    if (!response.ok) throw new Error("Could not record preset interaction.");
    return response.json() as Promise<{
      counted: boolean;
      reason: string;
      statistics?: { copies: { total: number } };
    }>;
  } catch (error) {
    if (throttleKey) {
      try {
        window.localStorage.removeItem(throttleKey);
      } catch {
        // The failed request is still surfaced when browser storage is unavailable.
      }
    }
    throw error;
  }
}
