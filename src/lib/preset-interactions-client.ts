"use client";

import { PRESET_EVENT_POLICY, type PresetEventKind } from "@/src/domain/preset-events";

const LOCAL_THROTTLE_PREFIX = "straftat-preset-event:";

function shouldSend(presetId: string, kind: PresetEventKind, target: string) {
  if (typeof window === "undefined") return false;
  const key = `${LOCAL_THROTTLE_PREFIX}${presetId}:${kind}:${target}`;
  const now = Date.now();
  try {
    const previous = Number(window.localStorage.getItem(key) ?? 0);
    if (now - previous < PRESET_EVENT_POLICY[kind].dedupeMinutes * 60 * 1_000) return false;
    window.localStorage.setItem(key, String(now));
  } catch {
    return true;
  }
  return true;
}

export async function recordPresetInteraction(presetId: string, kind: PresetEventKind, options: { target?: string; presetVersionId?: string } = {}) {
  const target = kind === "copy" ? options.target ?? "" : "";
  if (!shouldSend(presetId, kind, target)) return;
  await fetch(`/api/presets/${encodeURIComponent(presetId)}/events`, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: crypto.randomUUID(),
      kind,
      target: target || undefined,
      presetVersionId: options.presetVersionId,
    }),
  });
}

export async function setPresetLike(presetId: string, liked: boolean) {
  const response = await fetch(`/api/presets/${encodeURIComponent(presetId)}/like`, {
    method: liked ? "PUT" : "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Sign in to like presets." : "Could not update this like.");
  return response.json() as Promise<{ liked: boolean; likes: number }>;
}
