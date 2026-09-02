"use client";

import { eventDayBucket, eventDedupeBucket, type PresetEventKind } from "@/src/domain/preset-events";

const LOCAL_THROTTLE_PREFIX = "straftat-preset-event:";
const LOCAL_COPY_PREFIX = "straftat-preset-copy:v1:";

type PassiveEventKind = Exclude<PresetEventKind, "copy">;

type InteractionResponse = {
  counted: boolean;
  reason: string;
  statistics?: { opens?: { total: number }; copies: { total: number } };
};

type LocalCopyClaim = {
  presetId: string;
  publicationId: string;
  targetKey: string;
  eventId: string;
  dayBucket: string;
  status: "pending" | "sent";
};

function claimThrottle(presetId: string, kind: PassiveEventKind) {
  if (typeof window === "undefined") return undefined;
  const key = `${LOCAL_THROTTLE_PREFIX}${presetId}:${kind}`;
  const bucket = eventDedupeBucket(kind);
  try {
    if (window.localStorage.getItem(key) === bucket) return undefined;
    window.localStorage.setItem(key, bucket);
  } catch {
    return "";
  }
  return key;
}

function copyClaimKey(presetId: string, targetKey: string, dayBucket: string) {
  return `${LOCAL_COPY_PREFIX}${dayBucket}:${presetId}:${targetKey}`;
}

function parseCopyClaim(raw: string | null): LocalCopyClaim | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<LocalCopyClaim>;
    if (
      typeof value.presetId !== "string" ||
      typeof value.publicationId !== "string" ||
      typeof value.targetKey !== "string" ||
      typeof value.eventId !== "string" ||
      typeof value.dayBucket !== "string" ||
      (value.status !== "pending" && value.status !== "sent")
    ) return undefined;
    return value as LocalCopyClaim;
  } catch {
    return undefined;
  }
}

function cleanOldCopyClaims(dayBucket: string) {
  if (typeof window === "undefined") return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(LOCAL_COPY_PREFIX) && !key.startsWith(`${LOCAL_COPY_PREFIX}${dayBucket}:`)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Server deduplication remains authoritative when browser storage is unavailable.
  }
}

function claimPresetCopy(presetId: string, publicationId: string, targetKey: string) {
  const dayBucket = eventDayBucket();
  const storageKey = copyClaimKey(presetId, targetKey, dayBucket);
  const freshClaim: LocalCopyClaim = {
    presetId,
    publicationId,
    targetKey,
    eventId: crypto.randomUUID(),
    dayBucket,
    status: "pending",
  };
  if (typeof window === "undefined") return { claim: freshClaim, storageKey: "", optimistic: true };
  try {
    cleanOldCopyClaims(dayBucket);
    const existing = parseCopyClaim(window.localStorage.getItem(storageKey));
    if (existing?.status === "sent") return undefined;
    if (existing) {
      const currentClaim = existing.publicationId === publicationId ? existing : { ...existing, publicationId };
      if (currentClaim !== existing) window.localStorage.setItem(storageKey, JSON.stringify(currentClaim));
      return { claim: currentClaim, storageKey, optimistic: false };
    }
    window.localStorage.setItem(storageKey, JSON.stringify(freshClaim));
    return { claim: freshClaim, storageKey, optimistic: true };
  } catch {
    return { claim: freshClaim, storageKey: "", optimistic: true };
  }
}

function markCopyClaimSent(storageKey: string, claim: LocalCopyClaim) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ ...claim, status: "sent" } satisfies LocalCopyClaim));
  } catch {
    // The server has already accepted or rejected the event.
  }
}

function discardCopyClaim(storageKey: string) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // The stale event will expire with the daily local key.
  }
}

async function sendCopyClaim(storageKey: string, claim: LocalCopyClaim): Promise<InteractionResponse> {
  const url = `/api/presets/${encodeURIComponent(claim.presetId)}/events`;
  const body = JSON.stringify({
    eventId: claim.eventId,
    kind: "copy",
    publicationId: claim.publicationId,
    targetKey: claim.targetKey,
  });
  let settled = false;
  const flushOnPageHide = () => {
    if (settled || typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  };
  window.addEventListener?.("pagehide", flushOnPageHide, { once: true });
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) markCopyClaimSent(storageKey, claim);
      throw new Error("Could not record preset copy.");
    }
    const result = await response.json() as InteractionResponse;
    if (result.reason === "ignored") discardCopyClaim(storageKey);
    else markCopyClaimSent(storageKey, claim);
    return result;
  } finally {
    settled = true;
    window.removeEventListener?.("pagehide", flushOnPageHide);
  }
}

export async function recordPresetInteraction(presetId: string, kind: PassiveEventKind, onAccepted?: () => void) {
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
    return response.json() as Promise<InteractionResponse>;
  } catch (error) {
    if (throttleKey) {
      try {
        window.localStorage.removeItem(throttleKey);
      } catch {
        // A later server request can still deduplicate the interaction.
      }
    }
    throw error;
  }
}

export async function recordPresetCopy(
  presetId: string,
  publicationId: string,
  targetKey: string,
  onAccepted?: () => void,
) {
  const claimed = claimPresetCopy(presetId, publicationId, targetKey);
  if (!claimed) return undefined;
  if (claimed.optimistic) onAccepted?.();
  return sendCopyClaim(claimed.storageKey, claimed.claim);
}

export async function retryPendingPresetCopies(onResult?: (presetId: string, result: InteractionResponse) => void) {
  if (typeof window === "undefined") return;
  const dayBucket = eventDayBucket();
  cleanOldCopyClaims(dayBucket);
  const pending: Array<{ key: string; claim: LocalCopyClaim }> = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(`${LOCAL_COPY_PREFIX}${dayBucket}:`)) continue;
      const claim = parseCopyClaim(window.localStorage.getItem(key));
      if (claim?.status === "pending") pending.push({ key, claim });
    }
  } catch {
    return;
  }
  for (const item of pending) {
    try {
      const result = await sendCopyClaim(item.key, item.claim);
      onResult?.(item.claim.presetId, result);
    } catch {
      // Leave the event pending for a later copy or visit.
    }
  }
}
