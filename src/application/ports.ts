import type { UserProfile } from "@/src/domain/user-profile";

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
  upsertDiscordUser(id: string, name: string): Promise<{ isActive: boolean; profile: UserProfile }>;
  getUserProfile(id: string): Promise<UserProfile | undefined>;
  updateUserDisplayName(id: string, displayName: string | null): Promise<UserProfile | undefined>;
  getUserRole(id: string): Promise<UserRole | undefined>;
}

export type UserRole = "member" | "moderator" | "admin";

export type PresetDashboardView = "popular" | "newest" | "updated" | "mine";

export type PresetSearchInput = {
  query: string;
  tagSlugs: string[];
  weaponGameIds: string[];
  authorId?: string;
  order: "popular" | "updated";
  limit: number;
  offset: number;
};

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
  copyManifest: PresetCopyManifest | null;
  issues: PresetIssue[];
  views: number;
  copies: number;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type PublishedPresetPreview = {
  id: string;
  slug: string;
  title: string;
  description: string;
  authorName: string;
  thumbnailKey: string | null;
};

export type PresetSaveDraftResult =
  | { result: "updated"; preset: PresetDashboardItem; thumbnailKeysToDelete?: string[] }
  | { result: "invalid"; issues: PresetIssue[] }
  | { result: "not_found" }
  | { result: "forbidden" }
  | { result: "conflict" };

export type PresetSubmitResult =
  | { result: "updated"; preset: PresetDashboardItem; thumbnailKeysToDelete?: string[] }
  | { result: "invalid"; issues: PresetIssue[] }
  | { result: "not_found" }
  | { result: "forbidden" }
  | { result: "conflict" }
  | { result: "rate_limited"; message: string; retryAfterSeconds?: number }
  | { result: "no_changes"; message: string };

export type PresetMutationResult = PresetSaveDraftResult;

export type PresetReviewResult =
  | { result: "updated"; preset: PresetDashboardItem; thumbnailKeysToDelete?: string[] }
  | { result: "invalid"; issues: PresetIssue[] }
  | { result: "not_found" }
  | { result: "conflict" };

export type PresetRetractResult =
  | { result: "retracted"; preset: PresetDashboardItem; authorName: string; title: string; suspendedUntil: Date }
  | { result: "not_found" }
  | { result: "not_published" };

export type TelegramModerationMessage = {
  revisionId: string;
  chatId: string;
  messageId: number;
  kind: "text" | "photo";
  html: string;
  resolvedAt: Date | null;
};

export type RevisionModerationContext = {
  presetId: string;
  status: PresetRevisionStatus;
  decision: "approve" | "text" | "picture" | "spam" | null;
  message?: TelegramModerationMessage;
};

export interface PresetWorkflowRepository {
  createPresetDraft(userId: string, title: string, now?: Date): Promise<PresetDashboardItem>;
  listDashboardPresets(view: PresetDashboardView, userId: string | undefined, limit: number, offset: number): Promise<{ items: PresetDashboardItem[]; total: number }>;
  searchPublishedPresets(input: PresetSearchInput, userId?: string): Promise<{ items: PresetDashboardItem[]; total: number }>;
  getPresetForViewer(presetId: string, userId?: string): Promise<PresetDashboardItem | undefined>;
  getRevisionModerationContext(revisionId: string): Promise<RevisionModerationContext | undefined>;
  clearTelegramModerationMessage(revisionId: string, messageId: number): Promise<boolean>;
  findPresetIdByTelegramMessageId(messageId: number): Promise<string | undefined>;
  savePresetDraft(input: { presetId: string; userId: string; revisionId: string; editVersion: number; content: PresetRevisionContent; now?: Date }): Promise<PresetSaveDraftResult>;
  submitPreset(input: { presetId: string; userId: string; revisionId: string; editVersion: number; now?: Date }): Promise<PresetSubmitResult>;
  reviewPreset(input: { presetId: string; revisionId: string; reviewerId: string | null; decision: "approve" | "reject"; issues: PresetIssue[]; now?: Date }): Promise<PresetReviewResult>;
  retractPreset(input: { identifier: string; reason?: string; suspensionDays?: number; reviewerId?: string | null; now?: Date }): Promise<PresetRetractResult>;
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
  surge: number;
  lucky: number;
};

export type RecordPresetEventInput = {
  presetId: string;
  kind: PresetEventKind;
  actorHash: string;
  networkHash?: string;
  isAuthenticated: boolean;
  clientEventId: string;
  dedupeBucket: string;
  dayBucket: string;
  copyTarget?: {
    publicationId: string;
    targetKey: string;
  };
  occurredAt: Date;
};

export type RecordPresetEventResult = {
  result: "counted" | "duplicate" | "ignored" | "network_limited" | "not_found";
  statistics?: PresetStatisticsSnapshot;
};

export interface PresetInteractionRepository {
  recordPresetEvent(input: RecordPresetEventInput): Promise<RecordPresetEventResult>;
  recalculatePresetStatistics(presetId: string, now?: Date): Promise<PresetStatisticsSnapshot | undefined>;
  listRankedPresetOrder(limit: number, offset: number, now?: Date): Promise<{ items: RankedPresetOrderEntry[]; total: number; rankingVersion: number; generatedAt: number }>;
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
import type { PresetCopyManifest } from "@/src/domain/preset-copy";
import type { RankingBreakdown } from "@/src/domain/preset-ranking";
import type { PresetRevisionContent } from "@/src/domain/preset-content";
import type { PresetIssue, PresetRevisionStatus, UserPresetState } from "@/src/domain/preset-workflow";
