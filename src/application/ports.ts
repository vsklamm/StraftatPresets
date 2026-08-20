export type ActiveTag = {
  slug: string;
  label: string;
};

export type PresetThumbnailTarget = {
  id: string;
  authorId: string;
  thumbnailKey: string | null;
  publishedThumbnailKey: string | null;
};

export type ModerationRecord = {
  status: "approved" | "needs_review" | "rejected";
  data: string;
  moderatedAt: Date;
};

export interface UserRepository {
  upsertDiscordUser(id: string, name: string): Promise<{ isActive: boolean }>;
  getUserRole(id: string): Promise<UserRole | undefined>;
}

export type UserRole = "member" | "moderator" | "admin";

export type PresetDashboardView = "popular" | "newest" | "mine";

export type PresetDashboardItem = {
  id: string;
  slug: string;
  authorId: string;
  authorName: string;
  state?: UserPresetState;
  workingStatus: PresetRevisionStatus | null;
  hasPublishedRevision: boolean;
  canEdit: boolean;
  revisionId: string;
  revisionNumber: number;
  editVersion: number;
  content: PresetRevisionContent;
  issues: PresetIssue[];
  likes: number;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type PresetMutationResult =
  | { result: "updated"; preset: PresetDashboardItem; thumbnailKeysToDelete?: string[] }
  | { result: "invalid"; issues: PresetIssue[] }
  | { result: "not_found" }
  | { result: "forbidden" }
  | { result: "conflict" };

export type PresetReviewResult =
  | { result: "updated"; preset: PresetDashboardItem; thumbnailKeysToDelete?: string[] }
  | { result: "invalid"; issues: PresetIssue[] }
  | { result: "not_found" }
  | { result: "conflict" };

export interface PresetWorkflowRepository {
  createPresetDraft(userId: string, title: string, now?: Date): Promise<PresetDashboardItem>;
  listDashboardPresets(view: PresetDashboardView, userId: string | undefined, limit: number, offset: number): Promise<{ items: PresetDashboardItem[]; total: number }>;
  getPresetForViewer(presetId: string, userId?: string): Promise<PresetDashboardItem | undefined>;
  getPresetIdForRevision(revisionId: string): Promise<string | undefined>;
  savePresetDraft(input: { presetId: string; userId: string; revisionId: string; editVersion: number; content: PresetRevisionContent; now?: Date }): Promise<PresetMutationResult>;
  submitPreset(input: { presetId: string; userId: string; revisionId: string; editVersion: number; now?: Date }): Promise<PresetMutationResult>;
  reviewPreset(input: { presetId: string; revisionId: string; reviewerId: string; decision: "approve" | "reject"; issues: PresetIssue[]; now?: Date }): Promise<PresetReviewResult>;
  deletePreset(presetId: string, userId: string): Promise<{ result: "deleted" | "forbidden" | "not_found" }>;
}

export interface TagRepository {
  listActiveTags(): Promise<ActiveTag[]>;
  replacePresetTags(presetId: string, requestedTagSlugs: readonly string[]): Promise<void>;
}

export interface PresetThumbnailRepository {
  findThumbnailTarget(presetId: string): Promise<PresetThumbnailTarget | undefined>;
  updateThumbnailKeyAndStatus(presetId: string, key: string, moderation: ModerationRecord): Promise<void>;
}

export interface HealthRepository {
  ping(): Promise<void>;
}

export type PresetStatisticsSnapshot = {
  likes: number;
  opens: { total: number; uniqueAnonymous: number; uniqueAuthenticated: number };
  linkOpens: { total: number; uniqueAnonymous: number; uniqueAuthenticated: number };
  copies: { total: number; uniqueAnonymous: number; uniqueAuthenticated: number };
  abuseSignals: number;
  ranking: RankingBreakdown;
};

export type RankedPresetOrderEntry = {
  id: string;
  slug: string;
  score: number;
  quality: number;
  engagement: number;
  freshness: number;
};

export type RecordPresetEventInput = {
  presetId: string;
  presetVersionId?: string;
  kind: PresetEventKind;
  target: string;
  actorHash: string;
  networkHash?: string;
  isAuthenticated: boolean;
  clientEventId: string;
  dedupeBucket: string;
  dayBucket: string;
  occurredAt: Date;
};

export type RecordPresetEventResult = {
  result: "counted" | "duplicate" | "network_limited" | "not_found" | "invalid_version";
  statistics?: PresetStatisticsSnapshot;
};

export type SetPresetLikeInput = {
  presetId: string;
  userId: string;
  actorHash: string;
  liked: boolean;
  networkHash?: string;
  dayBucket: string;
  occurredAt: Date;
};

export type SetPresetLikeResult = {
  result: "updated" | "unchanged" | "rate_limited" | "not_found";
  liked: boolean;
  statistics?: PresetStatisticsSnapshot;
};

export interface PresetInteractionRepository {
  recordPresetEvent(input: RecordPresetEventInput): Promise<RecordPresetEventResult>;
  setPresetLike(input: SetPresetLikeInput): Promise<SetPresetLikeResult>;
  recalculatePresetStatistics(presetId: string, now?: Date): Promise<PresetStatisticsSnapshot | undefined>;
  listRankedPresetOrder(limit: number, offset: number, now?: Date): Promise<{ items: RankedPresetOrderEntry[]; total: number }>;
}

export type StoredThumbnail = {
  body: ReadableStream;
  contentType: string;
  cacheControl?: string;
  etag: string;
};

export type ThumbnailUpload = {
  bytes: Uint8Array;
  contentType: "image/webp";
  extension: "webp";
};

export interface ThumbnailProcessor {
  transform(bytes: Uint8Array): Promise<Uint8Array>;
}

export interface ThumbnailStore {
  put(presetId: string, upload: ThumbnailUpload): Promise<{ key: string; url: string }>;
  get(key: string): Promise<StoredThumbnail | null>;
  delete(key: string): Promise<void>;
}
import type { PresetEventKind } from "@/src/domain/preset-events";
import type { RankingBreakdown } from "@/src/domain/preset-ranking";
import type { PresetRevisionContent } from "@/src/domain/preset-content";
import type { PresetIssue, PresetRevisionStatus, UserPresetState } from "@/src/domain/preset-workflow";
