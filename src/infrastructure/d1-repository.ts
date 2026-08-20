import { and, asc, count, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { BatchItem } from "drizzle-orm/batch";
import type { AppDatabase } from "@/db";
import {
  likes,
  mapPlaylistMaps,
  mapPlaylists,
  presetAbuseSignals,
  presetEvents,
  presetLikeEvents,
  presetRevisions,
  presetStatistics,
  presetTags,
  presetUniqueActors,
  presetVersions,
  presets,
  randomizedWeapons,
  tags,
  users,
  weaponConfigurations,
} from "@/db/schema";
import type {
  ActiveTag,
  HealthRepository,
  ModerationRecord,
  PresetDashboardItem,
  PresetDashboardView,
  PresetInteractionRepository,
  PresetMutationResult,
  PresetReviewResult,
  RankedPresetOrderEntry,
  PresetStatisticsSnapshot,
  PresetThumbnailRepository,
  PresetThumbnailTarget,
  PresetWorkflowRepository,
  RecordPresetEventInput,
  RecordPresetEventResult,
  SetPresetLikeInput,
  SetPresetLikeResult,
  TagRepository,
  UserRepository,
  UserRole,
} from "@/src/application/ports";
import { createStarterPresetContent, parsePresetRevisionContent, type PresetRevisionContent } from "@/src/domain/preset-content";
import { runServerModeration } from "@/src/lib/moderation";
import { notifyModeratorOfPendingPreset } from "@/src/infrastructure/telegram";
import { decodeMapPlaylistExport } from "@/src/domain/map-playlist-export";
import { resolveWeaponName } from "@/src/domain/game-catalog";
import { PRESET_EVENT_POLICY, type PresetEventKind } from "@/src/domain/preset-events";
import {
  calculateFreshnessScore,
  calculatePresetRanking,
  scoreToMilli,
  type InteractionSignals,
  type PresetContentSignals,
  type PresetEngagementSignals,
} from "@/src/domain/preset-ranking";
import { validatePresetTagSlugs } from "@/src/domain/tag-policy";
import { MIN_WEAPON_WEIGHT, MAX_WEAPON_WEIGHT } from "@/src/domain/weapon-weights";
import { MAX_PRESETS_PER_AUTHOR, PresetLimitReachedError } from "@/src/domain/preset-policy";
import {
  thumbnailKeysToDeleteAfterDraftSave,
  thumbnailKeysToDeleteAfterPublish,
} from "@/src/domain/thumbnail-lifecycle";
import {
  deriveUserPresetState,
  planPresetEdit,
  validatePresetRevision,
  type PresetIssue,
  type PresetRevisionStatus,
} from "@/src/domain/preset-workflow";

const LIKE_TOGGLE_DAILY_LIMIT = 10;
const dashboardRevision = alias(presetRevisions, "dashboard_revision");

async function decodeRevisionPlaylists(content: PresetRevisionContent) {
  const issues: PresetIssue[] = [];
  const invalidPlaylistPrefixes = new Set<string>();
  const versions = await Promise.all(content.versions.map(async (version, versionIndex) => ({
    ...version,
    mapPlaylists: await Promise.all(version.mapPlaylists.map(async (playlist, playlistIndex) => {
      if (!playlist.encodedValue.trim()) return playlist;
      try {
        const decoded = await decodeMapPlaylistExport(playlist.encodedValue);
        return { ...playlist, name: decoded.name, mapNames: decoded.mapNames };
      } catch {
        const prefix = `versions.${versionIndex}.mapPlaylists.${playlistIndex}`;
        invalidPlaylistPrefixes.add(prefix);
        issues.push({
          source: "validation",
          field: `${prefix}.encodedValue`,
          code: "invalid_playlist_export",
          message: `Playlist ${playlistIndex + 1} has an invalid export code.`,
        });
        return { ...playlist, name: "", mapNames: [] };
      }
    })),
  })));
  issues.sort((left, right) => left.field.localeCompare(right.field));
  return { content: { ...content, versions }, issues, invalidPlaylistPrefixes };
}

type DashboardRow = {
  id: string;
  slug: string;
  authorId: string;
  authorName: string;
  workingRevisionId: string | null;
  publishedRevisionId: string | null;
  revisionId: string;
  revisionNumber: number;
  revisionStatus: PresetRevisionStatus;
  contentJson: string;
  validationIssuesJson: string;
  reviewIssuesJson: string;
  editVersion: number;
  likes: number | null;
  updatedAt: Date;
  publishedAt: Date | null;
};

function parseIssues(value: string): PresetIssue[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed as PresetIssue[] : [];
}

import { sha256Hex } from "@/src/lib/crypto-utils";
import { slugifyPresetTitle } from "@/src/domain/preset-slug";

async function hashRevisionContent(contentJson: string) {
  return sha256Hex(contentJson);
}

const dashboardColumns = {
  id: presets.id,
  slug: presets.slug,
  authorId: presets.authorId,
  authorName: users.name,
  workingRevisionId: presets.workingRevisionId,
  publishedRevisionId: presets.publishedRevisionId,
  revisionId: dashboardRevision.id,
  revisionNumber: dashboardRevision.revisionNumber,
  revisionStatus: dashboardRevision.status,
  contentJson: dashboardRevision.contentJson,
  validationIssuesJson: dashboardRevision.validationIssuesJson,
  reviewIssuesJson: dashboardRevision.reviewIssuesJson,
  editVersion: dashboardRevision.editVersion,
  likes: presetStatistics.likesCount,
  updatedAt: dashboardRevision.updatedAt,
  publishedAt: presets.publishedAt,
};

const zeroInteractions = (): InteractionSignals => ({ total: 0, uniqueAnonymous: 0, uniqueAuthenticated: 0 });

function isUniqueConstraintError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const message = current instanceof Error ? current.message : String(current);
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message)) return true;
    current = typeof current === "object" && "cause" in current ? current.cause : undefined;
  }
  return false;
}

function utcDayStart(dayBucket: string) {
  const date = new Date(`${dayBucket}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid event day bucket.");
  return date;
}

export class D1Repository implements HealthRepository, PresetInteractionRepository, PresetThumbnailRepository, PresetWorkflowRepository, TagRepository, UserRepository {
  constructor(private readonly database: AppDatabase) {}

  async ping() {
    await this.database.run(sql`select 1`);
  }

  async upsertDiscordUser(id: string, name: string) {
    const now = new Date();
    return this.database.insert(users).values({ id, name, lastLoginAt: now, createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: users.id,
      set: { name, lastLoginAt: now, updatedAt: now },
    }).returning({ isActive: users.isActive }).get();
  }

  async getUserRole(id: string): Promise<UserRole | undefined> {
    return (await this.database.select({ role: users.role }).from(users).where(and(eq(users.id, id), eq(users.isActive, true))).get())?.role;
  }

  async listActiveTags(): Promise<ActiveTag[]> {
    return this.database.select({ slug: tags.slug, label: tags.label })
      .from(tags)
      .where(eq(tags.isActive, true))
      .orderBy(asc(tags.sortOrder), asc(tags.label))
      .all();
  }

  async replacePresetTags(presetId: string, requestedTagSlugs: readonly string[]) {
    const tagSlugs = validatePresetTagSlugs(requestedTagSlugs);
    if (tagSlugs.length) {
      const activeTags = await this.database.select({ slug: tags.slug }).from(tags)
        .where(and(inArray(tags.slug, tagSlugs), eq(tags.isActive, true)))
        .all();
      const activeSlugs = new Set(activeTags.map((tag) => tag.slug));
      const unavailable = tagSlugs.filter((slug) => !activeSlugs.has(slug));
      if (unavailable.length) throw new Error(`Unknown or inactive tags: ${unavailable.join(", ")}`);
    }

    const removeExisting = this.database.delete(presetTags).where(eq(presetTags.presetId, presetId));
    if (!tagSlugs.length) {
      await removeExisting.run();
      return;
    }
    const addRequested = this.database.insert(presetTags).values(tagSlugs.map((tagSlug, position) => ({ presetId, tagSlug, position })));
    await this.database.batch([removeExisting, addRequested]);
  }

  async createPresetDraft(userId: string, title: string, now = new Date()): Promise<PresetDashboardItem> {
    await this.database.insert(users).values({
      id: userId,
      name: "Discord user",
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing().run();

    const existingCount = await this.database
      .select({ value: count() })
      .from(presets)
      .where(eq(presets.authorId, userId))
      .get();

    if ((existingCount?.value ?? 0) >= MAX_PRESETS_PER_AUTHOR) {
      throw new PresetLimitReachedError(MAX_PRESETS_PER_AUTHOR);
    }

    const content = createStarterPresetContent(title.trim());
    const contentJson = JSON.stringify(content);
    const presetId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const validationIssues = validatePresetRevision(content);
    await this.database.batch([
      this.database.insert(presets).values({
        id: presetId,
        slug: slugifyPresetTitle(content.title, presetId),
        authorId: userId,
        title: content.title,
        description: content.description,
        status: "draft",
        revisionCounter: 1,
        createdAt: now,
        updatedAt: now,
      }),
      this.database.insert(presetRevisions).values({
        id: revisionId,
        presetId,
        revisionNumber: 1,
        status: "draft",
        contentJson,
        contentHash: await hashRevisionContent(contentJson),
        validationIssuesJson: JSON.stringify(validationIssues),
        createdAt: now,
        updatedAt: now,
      }),
      this.database.update(presets).set({ workingRevisionId: revisionId }).where(eq(presets.id, presetId)),
    ]);
    const created = await this.getPresetForViewer(presetId, userId);
    if (!created) throw new Error("Created preset could not be read back.");
    return created;
  }

  async listDashboardPresets(view: PresetDashboardView, userId: string | undefined, limit: number, offset: number) {
    if (view === "mine") {
      if (!userId) return { items: [], total: 0 };
      const condition = eq(presets.authorId, userId);
      const [rows, total] = await Promise.all([
        this.database.select(dashboardColumns).from(presets)
          .innerJoin(users, eq(users.id, presets.authorId))
          .innerJoin(dashboardRevision, sql`${dashboardRevision.id} = coalesce(${presets.workingRevisionId}, ${presets.publishedRevisionId})`)
          .leftJoin(presetStatistics, eq(presetStatistics.presetId, presets.id))
          .where(condition)
          .orderBy(desc(dashboardRevision.updatedAt), asc(presets.id))
          .limit(limit).offset(offset).all(),
        this.database.select({ value: count() }).from(presets).where(condition).get(),
      ]);
      return {
        items: (rows as DashboardRow[]).map((row) => this.toDashboardItem(row, userId)),
        total: Number(total?.value ?? 0),
        likedPresetIds: await this.getLikedPresetIds(userId, rows),
      };
    }

    const condition = and(eq(presets.status, "published"), sql`${presets.publishedRevisionId} is not null`);
    const baseQuery = () => this.database.select(dashboardColumns).from(presets)
      .innerJoin(users, eq(users.id, presets.authorId))
      .innerJoin(dashboardRevision, eq(dashboardRevision.id, presets.publishedRevisionId))
      .leftJoin(presetStatistics, eq(presetStatistics.presetId, presets.id))
      .where(condition);
    const rows = view === "newest"
      ? await baseQuery().orderBy(desc(presets.publishedAt), asc(presets.id)).limit(limit).offset(offset).all()
      : await baseQuery().orderBy(
        desc(sql`coalesce(${presetStatistics.qualityScoreMilli}, 0) + coalesce(${presetStatistics.engagementScoreMilli}, 0)`),
        desc(presets.publishedAt),
        asc(presets.id),
      ).limit(limit).offset(offset).all();
    const total = await this.database.select({ value: count() }).from(presets).where(condition).get();

    return {
      items: (rows as DashboardRow[]).map((row) => this.toDashboardItem(row, userId)),
      total: Number(total?.value ?? 0),
      likedPresetIds: await this.getLikedPresetIds(userId, rows),
    };
  }

  private async getLikedPresetIds(userId: string | undefined, rows: { id: string }[]): Promise<string[]> {
    if (!userId || rows.length === 0) return [];
    const returnedIds = rows.map((r) => r.id);
    const userLikes = await this.database.select({ id: likes.presetId })
      .from(likes)
      .where(and(eq(likes.userId, userId), inArray(likes.presetId, returnedIds)))
      .all();
    return userLikes.map((l) => l.id);
  }

  async getPresetForViewer(presetId: string, userId?: string): Promise<PresetDashboardItem | undefined> {
    const envelope = await this.database.select({
      id: presets.id,
      authorId: presets.authorId,
      status: presets.status,
      workingRevisionId: presets.workingRevisionId,
      publishedRevisionId: presets.publishedRevisionId,
    }).from(presets).where(or(eq(presets.id, presetId), eq(presets.slug, presetId))).get();
    if (!envelope) return undefined;
    const isOwner = envelope.authorId === userId;
    if (!isOwner && envelope.status !== "published") return undefined;
    const revisionId = isOwner ? (envelope.workingRevisionId ?? envelope.publishedRevisionId) : envelope.publishedRevisionId;
    if (!revisionId) return undefined;
    const row = await this.database.select(dashboardColumns).from(presets)
      .innerJoin(users, eq(users.id, presets.authorId))
      .innerJoin(dashboardRevision, eq(dashboardRevision.id, revisionId))
      .leftJoin(presetStatistics, eq(presetStatistics.presetId, presets.id))
      .where(eq(presets.id, envelope.id)).get();
    return row ? this.toDashboardItem(row as DashboardRow, userId) : undefined;
  }

  async getPresetIdForRevision(revisionId: string): Promise<string | undefined> {
    const row = await this.database.select({ presetId: presetRevisions.presetId }).from(presetRevisions).where(eq(presetRevisions.id, revisionId)).get();
    return row?.presetId;
  }

  async savePresetDraft(input: { presetId: string; userId: string; revisionId: string; editVersion: number; content: PresetRevisionContent; now?: Date }): Promise<PresetMutationResult> {
    const now = input.now ?? new Date();
    const envelope = await this.database.select({
      authorId: presets.authorId,
      thumbnailKey: presets.thumbnailKey,
      workingRevisionId: presets.workingRevisionId,
      publishedRevisionId: presets.publishedRevisionId,
    }).from(presets).where(eq(presets.id, input.presetId)).get();
    if (!envelope) return { result: "not_found" };
    if (envelope.authorId !== input.userId) return { result: "forbidden" };

    const publishedRevision = envelope.publishedRevisionId
      ? await this.database.select({ contentJson: presetRevisions.contentJson }).from(presetRevisions).where(eq(presetRevisions.id, envelope.publishedRevisionId)).get()
      : undefined;
    const publishedThumbnailKey = publishedRevision
      ? parsePresetRevisionContent(JSON.parse(publishedRevision.contentJson)).thumbnailKey
      : null;

    const working = envelope.workingRevisionId
      ? await this.database.select({ id: presetRevisions.id, status: presetRevisions.status, editVersion: presetRevisions.editVersion }).from(presetRevisions).where(eq(presetRevisions.id, envelope.workingRevisionId)).get()
      : undefined;
    const plan = planPresetEdit(working?.status ?? null, Boolean(envelope.publishedRevisionId));
    const sourceRevisionId = working?.id ?? envelope.publishedRevisionId;
    if (sourceRevisionId !== input.revisionId || (working && working.editVersion !== input.editVersion)) return { result: "conflict" };

    if (input.content.thumbnailKey !== null && input.content.thumbnailKey !== envelope.thumbnailKey) return { result: "conflict" };
    const content = parsePresetRevisionContent(input.content);
    const contentJson = JSON.stringify(content);
    const contentHash = await hashRevisionContent(contentJson);
    const validationIssues = validatePresetRevision(content, { isInitialPublication: !envelope.publishedRevisionId });
    const thumbnailKeysToDelete = thumbnailKeysToDeleteAfterDraftSave(envelope.thumbnailKey, publishedThumbnailKey, content.thumbnailKey);
    const thumbnailUpdate = content.thumbnailKey === null ? {
      thumbnailKey: null,
      thumbnailModerationStatus: "not_submitted" as const,
      thumbnailModerationData: null,
      thumbnailModeratedAt: null,
    } : { thumbnailKey: content.thumbnailKey };

    if (plan === "update_draft") {
      const update = await this.database.update(presetRevisions).set({
        contentJson,
        contentHash,
        validationIssuesJson: JSON.stringify(validationIssues),
        reviewIssuesJson: "[]",
        editVersion: sql`${presetRevisions.editVersion} + 1`,
        updatedAt: now,
      }).where(and(
        eq(presetRevisions.id, input.revisionId),
        eq(presetRevisions.presetId, input.presetId),
        eq(presetRevisions.status, "draft"),
        eq(presetRevisions.editVersion, input.editVersion),
      )).run();
      if (Number(update.meta.changes) !== 1) return { result: "conflict" };
      await this.database.update(presets).set({
        ...thumbnailUpdate,
        ...(envelope.publishedRevisionId ? {} : { title: content.title, description: content.description, slug: slugifyPresetTitle(content.title, input.presetId) }),
        updatedAt: now,
      }).where(eq(presets.id, input.presetId)).run();
    } else {
      const counter = await this.database.update(presets).set({ revisionCounter: sql`${presets.revisionCounter} + 1` })
        .where(and(eq(presets.id, input.presetId), eq(presets.authorId, input.userId)))
        .returning({ value: presets.revisionCounter }).get();
      if (!counter) return { result: "conflict" };
      const revisionId = crypto.randomUUID();
      const statements: BatchItem<"sqlite">[] = [
        this.database.insert(presetRevisions).values({
          id: revisionId,
          presetId: input.presetId,
          revisionNumber: counter.value,
          sourceRevisionId,
          status: "draft",
          contentJson,
          contentHash,
          validationIssuesJson: JSON.stringify(validationIssues),
          createdAt: now,
          updatedAt: now,
        }),
        this.database.update(presets).set({
          ...thumbnailUpdate,
          workingRevisionId: revisionId,
          ...(envelope.publishedRevisionId ? {} : { title: content.title, description: content.description }),
          updatedAt: now,
        }).where(and(
          eq(presets.id, input.presetId),
          plan === "fork_published" ? isNull(presets.workingRevisionId) : eq(presets.workingRevisionId, input.revisionId),
        )),
      ];
      if (plan === "fork_working") statements.unshift(this.database.update(presetRevisions).set({ status: "superseded", updatedAt: now }).where(and(
        eq(presetRevisions.id, input.revisionId),
        eq(presetRevisions.presetId, input.presetId),
        inArray(presetRevisions.status, ["pending", "rejected"]),
        eq(presetRevisions.editVersion, input.editVersion),
      )));
      try {
        await this.database.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
      } catch (error) {
        if (isUniqueConstraintError(error)) return { result: "conflict" };
        throw error;
      }
    }

    const saved = await this.getPresetForViewer(input.presetId, input.userId);
    return saved ? { result: "updated", preset: saved, thumbnailKeysToDelete } : { result: "conflict" };
  }

  async submitPreset(input: { presetId: string; userId: string; revisionId: string; editVersion: number; now?: Date }): Promise<PresetMutationResult> {
    const now = input.now ?? new Date();
    const revision = await this.database.select({
      authorId: presets.authorId,
      workingRevisionId: presets.workingRevisionId,
      publishedRevisionId: presets.publishedRevisionId,
      status: presetRevisions.status,
      editVersion: presetRevisions.editVersion,
      contentJson: presetRevisions.contentJson,
      thumbnailKey: presets.thumbnailKey,
      thumbnailModerationStatus: presets.thumbnailModerationStatus,
    }).from(presets).innerJoin(presetRevisions, eq(presetRevisions.id, presets.workingRevisionId)).where(eq(presets.id, input.presetId)).get();
    if (!revision) return { result: "not_found" };
    if (revision.authorId !== input.userId) return { result: "forbidden" };
    if (revision.workingRevisionId !== input.revisionId || revision.status !== "draft" || revision.editVersion !== input.editVersion) return { result: "conflict" };

    const storedContent = parsePresetRevisionContent(JSON.parse(revision.contentJson));
    const decoded = await decodeRevisionPlaylists(storedContent);
    const content = parsePresetRevisionContent(decoded.content);
    const contentIssues = validatePresetRevision(content, { isInitialPublication: !revision.publishedRevisionId }).filter((issue) => !["missing_playlist_name", "empty_map_playlist"].includes(issue.code)
      || ![...decoded.invalidPlaylistPrefixes].some((prefix) => issue.field.startsWith(prefix)));
    const issues = [...decoded.issues, ...contentIssues, ...await this.validateActiveTags(content.tags)];
    if (issues.length) {
      await this.database.update(presetRevisions).set({ validationIssuesJson: JSON.stringify(issues), updatedAt: now }).where(and(
        eq(presetRevisions.id, input.revisionId),
        eq(presetRevisions.status, "draft"),
        eq(presetRevisions.editVersion, input.editVersion),
      )).run();
      return { result: "invalid", issues };
    }

    const contentJson = JSON.stringify(content);
    const update = await this.database.update(presetRevisions).set({
      status: "pending",
      contentJson,
      contentHash: await hashRevisionContent(contentJson),
      validationIssuesJson: "[]",
      reviewIssuesJson: "[]",
      submittedAt: now,
      updatedAt: now,
    }).where(and(
      eq(presetRevisions.id, input.revisionId),
      eq(presetRevisions.status, "draft"),
      eq(presetRevisions.editVersion, input.editVersion),
    )).run();
    if (Number(update.meta.changes) !== 1) return { result: "conflict" };

    const previousPublished = revision.publishedRevisionId
      ? await this.database.select({
          contentJson: presetRevisions.contentJson,
        }).from(presetRevisions).where(eq(presetRevisions.id, revision.publishedRevisionId)).get()
      : null;
    const previousContent = previousPublished ? parsePresetRevisionContent(JSON.parse(previousPublished.contentJson)) : null;

    const modResult = await runServerModeration(content, { previousContent });
    const isThumbnailApproved =
      revision.thumbnailModerationStatus === "approved" ||
      revision.thumbnailModerationStatus === "not_submitted" ||
      (previousContent !== null && revision.thumbnailKey === previousContent.thumbnailKey);

    if (modResult.decision === "approved" && isThumbnailApproved) {
      const autoReview = await this.reviewPreset({ presetId: input.presetId, revisionId: input.revisionId, reviewerId: null, decision: "approve", issues: [], now });
      if (autoReview.result === "updated") return autoReview;
    } else {
      const thumbnailUrl = revision.thumbnailKey ? `/api/media/${revision.thumbnailKey}` : undefined;
      await notifyModeratorOfPendingPreset(input.presetId, input.revisionId, content, thumbnailUrl).catch((err) => {
        console.error("Failed to notify moderator on Telegram:", err);
      });
    }

    const submitted = await this.getPresetForViewer(input.presetId, input.userId);
    return submitted ? { result: "updated", preset: submitted } : { result: "conflict" };
  }

  async reviewPreset(input: { presetId: string; revisionId: string; reviewerId: string | null; decision: "approve" | "reject"; issues: PresetIssue[]; now?: Date }): Promise<PresetReviewResult> {
    const now = input.now ?? new Date();
    const revision = await this.database.select({
      authorId: presets.authorId,
      workingRevisionId: presets.workingRevisionId,
      publishedRevisionId: presets.publishedRevisionId,
      publishedAt: presets.publishedAt,
      status: presetRevisions.status,
      contentJson: presetRevisions.contentJson,
    }).from(presets)
      .innerJoin(presetRevisions, eq(presetRevisions.id, presets.workingRevisionId))
      .where(eq(presets.id, input.presetId))
      .get();
    if (!revision) return { result: "not_found" };
    if (revision.workingRevisionId !== input.revisionId || revision.status !== "pending") return { result: "conflict" };

    if (input.decision === "reject") {
      const reviewIssues = input.issues.filter((issue) => issue.source === "moderation");
      if (!reviewIssues.length) return { result: "invalid", issues: [{
        source: "moderation",
        field: "preset",
        code: "rejection_reason_required",
        message: "Add at least one reason before rejecting the preset.",
      }] };
      const rejected = await this.database.update(presetRevisions).set({
        status: "rejected",
        reviewIssuesJson: JSON.stringify(reviewIssues),
        reviewerId: input.reviewerId,
        reviewedAt: now,
        updatedAt: now,
      }).where(and(eq(presetRevisions.id, input.revisionId), eq(presetRevisions.status, "pending"))).run();
      if (Number(rejected.meta.changes) !== 1) return { result: "conflict" };
      const preset = await this.getPresetForViewer(input.presetId, revision.authorId);
      return preset ? { result: "updated", preset } : { result: "conflict" };
    }

    const content = parsePresetRevisionContent(JSON.parse(revision.contentJson));
    const previousPublishedRevision = revision.publishedRevisionId
      ? await this.database.select({ contentJson: presetRevisions.contentJson }).from(presetRevisions).where(eq(presetRevisions.id, revision.publishedRevisionId)).get()
      : undefined;
    const previousPublishedThumbnailKey = previousPublishedRevision
      ? parsePresetRevisionContent(JSON.parse(previousPublishedRevision.contentJson)).thumbnailKey
      : null;
    const thumbnailKeysToDelete = thumbnailKeysToDeleteAfterPublish(previousPublishedThumbnailKey, content.thumbnailKey);
    const validationIssues = [...validatePresetRevision(content, { isInitialPublication: !revision.publishedRevisionId }), ...await this.validateActiveTags(content.tags)];
    if (validationIssues.length) return { result: "invalid", issues: validationIssues };

    const statements: BatchItem<"sqlite">[] = [
      this.database.delete(presetTags).where(eq(presetTags.presetId, input.presetId)),
      this.database.delete(presetVersions).where(eq(presetVersions.presetId, input.presetId)),
    ];
    if (content.tags.length) statements.push(this.database.insert(presetTags).values(
      content.tags.map((tagSlug, position) => ({ presetId: input.presetId, tagSlug, position })),
    ));

    for (const version of content.versions) {
      const versionId = crypto.randomUUID();
      statements.push(this.database.insert(presetVersions).values({
        id: versionId,
        presetId: input.presetId,
        label: version.label,
        createdAt: now,
      }));
      for (const [playlistIndex, playlist] of version.mapPlaylists.entries()) {
        const playlistId = crypto.randomUUID();
        statements.push(this.database.insert(mapPlaylists).values({
          id: playlistId,
          presetVersionId: versionId,
          name: playlist.name,
          description: playlist.description,
          encodedValue: playlist.encodedValue,
          decodedMapCount: playlist.mapNames.length,
          sortOrder: playlistIndex,
        }));
        if (playlist.mapNames.length) {
          const mapRows = playlist.mapNames.map((mapName, position) => ({ mapPlaylistId: playlistId, position, mapName }));
          for (let i = 0; i < mapRows.length; i += 20) {
            statements.push(this.database.insert(mapPlaylistMaps).values(mapRows.slice(i, i + 20)));
          }
        }
      }
      for (const configuration of version.weaponConfigurations) {
        const configurationId = crypto.randomUUID();
        statements.push(this.database.insert(weaponConfigurations).values({
          id: configurationId,
          presetVersionId: versionId,
          kind: configuration.kind,
          name: configuration.name,
          encodedValue: configuration.kind === "swapper" ? configuration.encodedValue : null,
        }));
        if (configuration.kind === "randomized" && configuration.weapons.length) {
          const seenWeapons = new Set<string>();
          const weaponRows: { id: string; weaponConfigurationId: string; weaponName: string; weight: number }[] = [];
          for (const weapon of configuration.weapons) {
            const canonicalName = resolveWeaponName(weapon.name) ?? weapon.name;
            const lookup = canonicalName.toLowerCase();
            if (seenWeapons.has(lookup)) continue;
            seenWeapons.add(lookup);
            const rawWeight = Number.isSafeInteger(weapon.weight) ? weapon.weight : 0;
            const clampedWeight = Math.max(MIN_WEAPON_WEIGHT, Math.min(MAX_WEAPON_WEIGHT, rawWeight));
            weaponRows.push({
              id: crypto.randomUUID(),
              weaponConfigurationId: configurationId,
              weaponName: canonicalName,
              weight: clampedWeight,
            });
          }
          for (let i = 0; i < weaponRows.length; i += 20) {
            statements.push(this.database.insert(randomizedWeapons).values(weaponRows.slice(i, i + 20)));
          }
        }
      }
    }

    if (revision.publishedRevisionId) statements.push(this.database.update(presetRevisions).set({
      status: "archived",
      updatedAt: now,
    }).where(and(eq(presetRevisions.id, revision.publishedRevisionId), eq(presetRevisions.status, "published"))));
    statements.push(
      this.database.update(presetRevisions).set({
        status: "published",
        validationIssuesJson: "[]",
        reviewIssuesJson: "[]",
        reviewerId: input.reviewerId,
        reviewedAt: now,
        updatedAt: now,
      }).where(and(eq(presetRevisions.id, input.revisionId), eq(presetRevisions.status, "pending"))),
      this.database.update(presets).set({
        title: content.title,
        description: content.description,
        thumbnailKey: content.thumbnailKey,
        ...(content.thumbnailKey === null ? {
          thumbnailModerationStatus: "not_submitted" as const,
          thumbnailModerationData: null,
          thumbnailModeratedAt: null,
        } : {}),
        status: "published",
        workingRevisionId: null,
        publishedRevisionId: input.revisionId,
        publishedAt: revision.publishedAt ?? now,
        updatedAt: now,
      }).where(and(eq(presets.id, input.presetId), eq(presets.workingRevisionId, input.revisionId))),
    );

    try {
      await this.database.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    } catch (error) {
      if (isUniqueConstraintError(error)) return { result: "conflict" };
      throw error;
    }
    await this.recalculatePresetStatistics(input.presetId, now);
    const preset = await this.getPresetForViewer(input.presetId, revision.authorId);
    return preset ? { result: "updated", preset, thumbnailKeysToDelete } : { result: "conflict" };
  }

  async deletePreset(presetId: string, userId: string): Promise<{ result: "deleted" | "forbidden" | "not_found" }> {
    const presetRow = await this.database.select({ authorId: presets.authorId }).from(presets).where(eq(presets.id, presetId)).get();
    if (!presetRow) return { result: "not_found" };
    if (presetRow.authorId !== userId) return { result: "forbidden" };

    await this.database.delete(presets).where(and(eq(presets.id, presetId), eq(presets.authorId, userId))).run();
    return { result: "deleted" };
  }

  async findThumbnailTarget(presetId: string): Promise<PresetThumbnailTarget | undefined> {
    const target = await this.database.select({ id: presets.id, authorId: presets.authorId, thumbnailKey: presets.thumbnailKey, publishedRevisionId: presets.publishedRevisionId })
      .from(presets)
      .where(eq(presets.id, presetId))
      .get();
    if (!target) return undefined;
    const publishedRevision = target.publishedRevisionId
      ? await this.database.select({ contentJson: presetRevisions.contentJson }).from(presetRevisions).where(eq(presetRevisions.id, target.publishedRevisionId)).get()
      : undefined;
    return {
      id: target.id,
      authorId: target.authorId,
      thumbnailKey: target.thumbnailKey,
      publishedThumbnailKey: publishedRevision
        ? parsePresetRevisionContent(JSON.parse(publishedRevision.contentJson)).thumbnailKey
        : null,
    };
  }

  async updateThumbnailKeyAndStatus(presetId: string, key: string, moderation: ModerationRecord) {
    await this.database.update(presets).set({
      thumbnailKey: key,
      thumbnailModerationStatus: moderation.status,
      thumbnailModerationData: moderation.data,
      thumbnailModeratedAt: moderation.moderatedAt,
      updatedAt: moderation.moderatedAt,
    }).where(eq(presets.id, presetId)).run();
  }

  async recordPresetEvent(input: RecordPresetEventInput): Promise<RecordPresetEventResult> {
    const preset = await this.database.select({ id: presets.id, status: presets.status }).from(presets).where(or(eq(presets.id, input.presetId), eq(presets.slug, input.presetId))).get();
    if (!preset || preset.status !== "published") return { result: "not_found" };

    const resolvedPresetId = preset.id;

    if (input.presetVersionId) {
      const version = await this.database.select({ id: presetVersions.id }).from(presetVersions)
        .where(and(eq(presetVersions.id, input.presetVersionId), eq(presetVersions.presetId, resolvedPresetId)))
        .get();
      if (!version) return { result: "invalid_version" };
    }

    const existingClientEvent = await this.database.select({ id: presetEvents.id }).from(presetEvents)
      .where(and(eq(presetEvents.presetId, resolvedPresetId), eq(presetEvents.clientEventId, input.clientEventId)))
      .get();
    if (existingClientEvent) return { result: "duplicate", statistics: await this.recalculatePresetStatistics(resolvedPresetId, input.occurredAt) };

    if (!input.isAuthenticated && input.networkHash) {
      const recentFromNetwork = await this.database.select({ value: count() }).from(presetEvents).where(and(
        eq(presetEvents.presetId, resolvedPresetId),
        eq(presetEvents.kind, input.kind),
        eq(presetEvents.networkHash, input.networkHash),
        eq(presetEvents.isInvalidated, false),
        gte(presetEvents.createdAt, utcDayStart(input.dayBucket)),
      )).get();
      if (Number(recentFromNetwork?.value ?? 0) >= PRESET_EVENT_POLICY[input.kind].anonymousNetworkDailyLimit) {
        await this.recordAbuseSignal(resolvedPresetId, input.kind, "network_limit", input.dayBucket, input.actorHash, input.networkHash, input.occurredAt);
        return { result: "network_limited" };
      }
    }

    try {
      const insertEvent = this.database.insert(presetEvents).values({
        id: crypto.randomUUID(),
        presetId: resolvedPresetId,
        presetVersionId: input.presetVersionId,
        kind: input.kind,
        actorHash: input.actorHash,
        networkHash: input.networkHash,
        isAuthenticated: input.isAuthenticated,
        clientEventId: input.clientEventId,
        dedupeBucket: input.dedupeBucket,
        target: input.target,
        createdAt: input.occurredAt,
      });
      const recordActor = this.database.insert(presetUniqueActors).values({
        presetId: resolvedPresetId,
        kind: input.kind,
        actorHash: input.actorHash,
        isAuthenticated: input.isAuthenticated,
        firstSeenAt: input.occurredAt,
        lastSeenAt: input.occurredAt,
        eventCount: 1,
      }).onConflictDoUpdate({
        target: [presetUniqueActors.presetId, presetUniqueActors.kind, presetUniqueActors.actorHash],
        set: {
          isAuthenticated: input.isAuthenticated,
          lastSeenAt: input.occurredAt,
          eventCount: sql`${presetUniqueActors.eventCount} + 1`,
        },
      });
      await this.database.batch([insertEvent, recordActor]);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const retry = await this.database.select({ id: presetEvents.id }).from(presetEvents)
        .where(and(eq(presetEvents.presetId, resolvedPresetId), eq(presetEvents.clientEventId, input.clientEventId)))
        .get();
      if (!retry) await this.recordAbuseSignal(resolvedPresetId, input.kind, "duplicate", input.dayBucket, input.actorHash, input.networkHash ?? "", input.occurredAt);
      return { result: "duplicate", statistics: retry ? await this.recalculatePresetStatistics(resolvedPresetId, input.occurredAt) : undefined };
    }

    return { result: "counted", statistics: await this.recalculatePresetStatistics(resolvedPresetId, input.occurredAt) };
  }

  async setPresetLike(input: SetPresetLikeInput): Promise<SetPresetLikeResult> {
    const preset = await this.database.select({ id: presets.id, status: presets.status }).from(presets).where(or(eq(presets.id, input.presetId), eq(presets.slug, input.presetId))).get();
    if (!preset || preset.status !== "published") return { result: "not_found", liked: false };

    const resolvedPresetId = preset.id;

    await this.database.insert(users).values({
      id: input.userId,
      name: "Discord user",
      lastLoginAt: input.occurredAt,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    }).onConflictDoNothing().run();

    const existing = await this.database.select({ presetId: likes.presetId }).from(likes)
      .where(and(eq(likes.presetId, resolvedPresetId), eq(likes.userId, input.userId)))
      .get();
    if (Boolean(existing) === input.liked) {
      return { result: "unchanged", liked: input.liked, statistics: await this.recalculatePresetStatistics(resolvedPresetId, input.occurredAt) };
    }

    const recentToggles = await this.database.select({ value: count() }).from(presetLikeEvents).where(and(
      eq(presetLikeEvents.presetId, resolvedPresetId),
      eq(presetLikeEvents.userId, input.userId),
      gte(presetLikeEvents.createdAt, utcDayStart(input.dayBucket)),
    )).get();
    if (Number(recentToggles?.value ?? 0) >= LIKE_TOGGLE_DAILY_LIMIT) {
      await this.recordAbuseSignal(resolvedPresetId, "like", "like_toggle_limit", input.dayBucket, input.actorHash, input.networkHash ?? "", input.occurredAt);
      return { result: "rate_limited", liked: Boolean(existing), statistics: await this.recalculatePresetStatistics(resolvedPresetId, input.occurredAt) };
    }

    const mutateLike = input.liked
      ? this.database.insert(likes).values({ presetId: resolvedPresetId, userId: input.userId, createdAt: input.occurredAt }).onConflictDoNothing()
      : this.database.delete(likes).where(and(eq(likes.presetId, resolvedPresetId), eq(likes.userId, input.userId)));
    const auditLike = this.database.insert(presetLikeEvents).values({
      id: crypto.randomUUID(),
      presetId: resolvedPresetId,
      userId: input.userId,
      action: input.liked ? "like" : "unlike",
      networkHash: input.networkHash ?? "",
      createdAt: input.occurredAt,
    });
    await this.database.batch([mutateLike, auditLike]);

    return { result: "updated", liked: input.liked, statistics: await this.recalculatePresetStatistics(resolvedPresetId, input.occurredAt) };
  }

  async recalculatePresetStatistics(presetId: string, now = new Date()): Promise<PresetStatisticsSnapshot | undefined> {
    const preset = await this.database.select({
      title: presets.title,
      description: presets.description,
      thumbnailKey: presets.thumbnailKey,
      publishedAt: presets.publishedAt,
    }).from(presets).where(eq(presets.id, presetId)).get();
    if (!preset) return undefined;

    const [versionTotal, playlistTotal, playlistWithDescTotal, tagTotal, weaponTotal, likeTotal, eventTotals, uniqueTotals, abuseTotal, latestEvent] = await Promise.all([
      this.database.select({ value: count() }).from(presetVersions).where(eq(presetVersions.presetId, presetId)).get(),
      this.database.select({ value: count() }).from(mapPlaylists).innerJoin(presetVersions, eq(mapPlaylists.presetVersionId, presetVersions.id)).where(eq(presetVersions.presetId, presetId)).get(),
      this.database.select({ value: count() }).from(mapPlaylists).innerJoin(presetVersions, eq(mapPlaylists.presetVersionId, presetVersions.id)).where(and(eq(presetVersions.presetId, presetId), ne(mapPlaylists.description, ""))).get(),
      this.database.select({ value: count() }).from(presetTags).where(eq(presetTags.presetId, presetId)).get(),
      this.database.select({ value: count() }).from(weaponConfigurations).innerJoin(presetVersions, eq(weaponConfigurations.presetVersionId, presetVersions.id)).where(eq(presetVersions.presetId, presetId)).get(),
      this.database.select({ value: count() }).from(likes).where(eq(likes.presetId, presetId)).get(),
      this.database.select({ kind: presetEvents.kind, value: count() }).from(presetEvents).where(and(eq(presetEvents.presetId, presetId), eq(presetEvents.isInvalidated, false))).groupBy(presetEvents.kind).all(),
      this.database.select({ kind: presetUniqueActors.kind, isAuthenticated: presetUniqueActors.isAuthenticated, value: count() }).from(presetUniqueActors).where(eq(presetUniqueActors.presetId, presetId)).groupBy(presetUniqueActors.kind, presetUniqueActors.isAuthenticated).all(),
      this.database.select({ value: sql<number>`coalesce(sum(${presetAbuseSignals.attemptCount}), 0)`.mapWith(Number) }).from(presetAbuseSignals).where(eq(presetAbuseSignals.presetId, presetId)).get(),
      this.database.select({ value: sql<number | null>`max(${presetEvents.createdAt})`.mapWith(Number) }).from(presetEvents).where(and(eq(presetEvents.presetId, presetId), eq(presetEvents.isInvalidated, false))).get(),
    ]);

    const interactions: Record<PresetEventKind, InteractionSignals> = {
      view: zeroInteractions(),
      link_open: zeroInteractions(),
      copy: zeroInteractions(),
    };
    for (const row of eventTotals) interactions[row.kind].total = Number(row.value);
    for (const row of uniqueTotals) {
      const key = row.isAuthenticated ? "uniqueAuthenticated" : "uniqueAnonymous";
      interactions[row.kind][key] = Number(row.value);
    }

    const content: PresetContentSignals = {
      title: preset.title,
      description: preset.description,
      hasThumbnail: Boolean(preset.thumbnailKey),
      versionCount: Number(versionTotal?.value ?? 0),
      mapPlaylistCount: Number(playlistTotal?.value ?? 0),
      mapPlaylistWithDescriptionCount: Number(playlistWithDescTotal?.value ?? 0),
      tagCount: Number(tagTotal?.value ?? 0),
      weaponConfigurationCount: Number(weaponTotal?.value ?? 0),
    };
    const engagement: PresetEngagementSignals = {
      likes: Number(likeTotal?.value ?? 0),
      opens: interactions.view,
      linkOpens: interactions.link_open,
      copies: interactions.copy,
    };
    const ranking = calculatePresetRanking(content, engagement, preset.publishedAt, now);
    const snapshot: PresetStatisticsSnapshot = {
      likes: engagement.likes,
      opens: engagement.opens,
      linkOpens: engagement.linkOpens,
      copies: engagement.copies,
      abuseSignals: Number(abuseTotal?.value ?? 0),
      ranking,
    };
    const values = {
      likesCount: snapshot.likes,
      viewsTotal: snapshot.opens.total,
      viewsUniqueAnonymous: snapshot.opens.uniqueAnonymous,
      viewsUniqueAuthenticated: snapshot.opens.uniqueAuthenticated,
      linkOpensTotal: snapshot.linkOpens.total,
      linkOpensUniqueAnonymous: snapshot.linkOpens.uniqueAnonymous,
      linkOpensUniqueAuthenticated: snapshot.linkOpens.uniqueAuthenticated,
      copiesTotal: snapshot.copies.total,
      copiesUniqueAnonymous: snapshot.copies.uniqueAnonymous,
      copiesUniqueAuthenticated: snapshot.copies.uniqueAuthenticated,
      qualityScoreMilli: scoreToMilli(ranking.quality),
      engagementScoreMilli: scoreToMilli(ranking.engagement),
      abuseSignalCount: snapshot.abuseSignals,
      lastEngagementAt: latestEvent?.value ? new Date(Number(latestEvent.value)) : null,
      updatedAt: now,
    };
    await this.database.insert(presetStatistics).values({ presetId, ...values }).onConflictDoUpdate({ target: presetStatistics.presetId, set: values }).run();
    return snapshot;
  }

  async listRankedPresetOrder(limit: number, offset: number, now = new Date()) {
    const published = await this.database.select({
      id: presets.id,
      slug: presets.slug,
      presetUpdatedAt: presets.updatedAt,
      publishedAt: presets.publishedAt,
      statisticsUpdatedAt: presetStatistics.updatedAt,
      qualityScoreMilli: presetStatistics.qualityScoreMilli,
      engagementScoreMilli: presetStatistics.engagementScoreMilli,
    }).from(presets).leftJoin(presetStatistics, eq(presetStatistics.presetId, presets.id)).where(eq(presets.status, "published")).all();

    for (const row of published) {
      if (!row.statisticsUpdatedAt || Number(row.qualityScoreMilli ?? 0) === 0 || row.statisticsUpdatedAt.getTime() < row.presetUpdatedAt.getTime()) await this.recalculatePresetStatistics(row.id, now);
    }

    const current = await this.database.select({
      id: presets.id,
      slug: presets.slug,
      publishedAt: presets.publishedAt,
      qualityScoreMilli: presetStatistics.qualityScoreMilli,
      engagementScoreMilli: presetStatistics.engagementScoreMilli,
    }).from(presets).leftJoin(presetStatistics, eq(presetStatistics.presetId, presets.id)).where(eq(presets.status, "published")).all();
    const items: RankedPresetOrderEntry[] = current.map((row) => {
      const quality = Number(row.qualityScoreMilli ?? 0) / 1_000;
      const engagement = Number(row.engagementScoreMilli ?? 0) / 1_000;
      const freshness = calculateFreshnessScore(row.publishedAt, now);
      return { id: row.id, slug: row.slug, quality, engagement, freshness, score: Math.round((quality + engagement + freshness) * 1_000) / 1_000 };
    }).sort((left, right) => right.score - left.score || right.quality - left.quality || left.id.localeCompare(right.id));
    return { items: items.slice(offset, offset + limit), total: items.length };
  }

  private toDashboardItem(row: DashboardRow, userId: string | undefined): PresetDashboardItem {
    const isOwner = row.authorId === userId;
    const workingStatus = isOwner && ["draft", "pending", "rejected"].includes(row.revisionStatus) ? row.revisionStatus : null;
    return {
      id: row.id,
      slug: row.slug,
      authorId: row.authorId,
      authorName: row.authorName,
      state: isOwner ? deriveUserPresetState(workingStatus, Boolean(row.publishedRevisionId)) : undefined,
      workingStatus,
      hasPublishedRevision: Boolean(row.publishedRevisionId),
      canEdit: isOwner,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      editVersion: row.editVersion,
      content: parsePresetRevisionContent(JSON.parse(row.contentJson)),
      issues: isOwner ? [...parseIssues(row.validationIssuesJson), ...parseIssues(row.reviewIssuesJson)] : [],
      likes: Number(row.likes ?? 0),
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
    };
  }

  private async validateActiveTags(requestedTagSlugs: readonly string[]): Promise<PresetIssue[]> {
    const tagSlugs = validatePresetTagSlugs(requestedTagSlugs);
    if (!tagSlugs.length) return [];
    const activeTags = await this.database.select({ slug: tags.slug }).from(tags)
      .where(and(inArray(tags.slug, tagSlugs), eq(tags.isActive, true)))
      .all();
    const activeSlugs = new Set(activeTags.map((tag) => tag.slug));
    return tagSlugs.filter((slug) => !activeSlugs.has(slug)).map((slug) => ({
      source: "validation" as const,
      field: "tags",
      code: "unavailable_tag",
      message: `Tag is unavailable: ${slug}`,
    }));
  }

  private async recordAbuseSignal(presetId: string, kind: PresetEventKind | "like", reason: "duplicate" | "network_limit" | "like_toggle_limit", dayBucket: string, actorHash: string, networkHash: string, occurredAt: Date) {
    await this.database.insert(presetAbuseSignals).values({
      id: crypto.randomUUID(),
      presetId,
      kind,
      reason,
      dayBucket,
      actorHash,
      networkHash,
      attemptCount: 1,
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
    }).onConflictDoUpdate({
      target: [presetAbuseSignals.presetId, presetAbuseSignals.kind, presetAbuseSignals.reason, presetAbuseSignals.dayBucket, presetAbuseSignals.actorHash, presetAbuseSignals.networkHash],
      set: { attemptCount: sql`${presetAbuseSignals.attemptCount} + 1`, lastSeenAt: occurredAt },
    }).run();
    await this.database.insert(presetStatistics).values({ presetId, abuseSignalCount: 1, updatedAt: occurredAt }).onConflictDoUpdate({
      target: presetStatistics.presetId,
      set: { abuseSignalCount: sql`${presetStatistics.abuseSignalCount} + 1`, updatedAt: occurredAt },
    }).run();
  }
}
