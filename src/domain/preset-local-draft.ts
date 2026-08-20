import { normalizePresetContent, presetRevisionContentSchema, type PresetRevisionContent } from "./preset-content";

const LOCAL_DRAFT_PREFIX = "straftat-presets:draft:";

export type LocalDraftSnapshot = {
  schemaVersion: 1;
  revisionId: string;
  editVersion: number;
  updatedAt: number; // Unix timestamp in ms
  content: PresetRevisionContent;
};

export function localDraftKey(presetId: string): string {
  return `${LOCAL_DRAFT_PREFIX}${presetId}`;
}

export function serializeLocalDraftSnapshot(input: {
  revisionId: string;
  editVersion: number;
  content: PresetRevisionContent;
  updatedAt?: number;
}): string {
  const snapshot: LocalDraftSnapshot = {
    schemaVersion: 1,
    revisionId: input.revisionId,
    editVersion: input.editVersion,
    updatedAt: input.updatedAt ?? Date.now(),
    content: input.content,
  };
  return JSON.stringify(snapshot);
}

export function parseLocalDraftSnapshot(raw: string | null | undefined): LocalDraftSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalDraftSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.schemaVersion !== 1) return null;
    if (typeof parsed.revisionId !== "string" || !parsed.revisionId) return null;
    if (typeof parsed.editVersion !== "number") return null;

    const contentResult = presetRevisionContentSchema.safeParse(parsed.content);
    if (!contentResult.success) return null;

    const updatedAt = typeof parsed.updatedAt === "number" && !Number.isNaN(parsed.updatedAt)
      ? parsed.updatedAt
      : 0;

    return {
      schemaVersion: 1,
      revisionId: parsed.revisionId,
      editVersion: parsed.editVersion,
      updatedAt,
      content: normalizePresetContent(contentResult.data),
    };
  } catch {
    return null;
  }
}

export function reconcileLocalDraftWithRemote(
  remote: {
    revisionId: string;
    editVersion: number;
    updatedAt?: Date | string | number | null;
    content: PresetRevisionContent;
  },
  localSnapshot: LocalDraftSnapshot | null,
): {
  effectiveContent: PresetRevisionContent;
  isLocalNewer: boolean;
  shouldClearLocal: boolean;
} {
  if (!localSnapshot) {
    return { effectiveContent: remote.content, isLocalNewer: false, shouldClearLocal: false };
  }

  // If local snapshot belongs to a different revision
  if (localSnapshot.revisionId !== remote.revisionId) {
    const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
    const isRemoteNewer = remoteTime > localSnapshot.updatedAt;
    return {
      effectiveContent: remote.content,
      isLocalNewer: false,
      shouldClearLocal: isRemoteNewer && localSnapshot.updatedAt > 0,
    };
  }

  const remoteSignature = JSON.stringify(remote.content);
  const localSignature = JSON.stringify(localSnapshot.content);

  // If contents are already identical, no discrepancy
  if (remoteSignature === localSignature) {
    return { effectiveContent: remote.content, isLocalNewer: false, shouldClearLocal: true };
  }

  const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
  const localTime = localSnapshot.updatedAt;

  // Local is newer if its timestamp is strictly greater than remote timestamp,
  // or if local editVersion >= remote editVersion when timestamps are missing or equal
  const isLocalNewer = localTime > remoteTime || (localTime === remoteTime && localSnapshot.editVersion >= remote.editVersion);

  if (isLocalNewer) {
    return {
      effectiveContent: localSnapshot.content,
      isLocalNewer: true,
      shouldClearLocal: false,
    };
  }

  // Remote is strictly newer
  return {
    effectiveContent: remote.content,
    isLocalNewer: false,
    shouldClearLocal: true,
  };
}
