import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { BatchItem } from "drizzle-orm/batch";
import type { AppDatabase } from "@/db";
import {
  mapPlaylists,
  presetAbuseSignals,
  presetEvents,
  presetRevisions,
  presetSearchDocuments,
  presetSearchTerms,
  presetStatistics,
  presetTags,
  presetUniqueActors,
  presetVersions,
  presets,
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
  PresetRetractResult,
  PresetReviewResult,
  PresetSearchInput,
  PresetSubmitResult,
  RankedPresetOrderEntry,
  PresetStatisticsSnapshot,
  PresetThumbnailRepository,
  PresetThumbnailTarget,
  PresetWorkflowRepository,
  RevisionModerationContext,
  RecordPresetEventInput,
  RecordPresetEventResult,
  TagRepository,
  TelegramModerationMessage,
  UserRepository,
  UserRole,
} from "@/src/application/ports";
import { createStarterPresetContent, parsePresetRevisionContent, type PresetRevisionContent } from "@/src/domain/preset-content";
import {
  buildFtsMatch,
  buildPresetSearchProjection,
  normalizeSearchValue,
  PRESET_SEARCH_SCHEMA_VERSION,
  resolveSearchEntities,
  splitSearchQuery,
} from "@/src/domain/preset-search";
import { copyTargetKeys, createPresetCopyManifest } from "@/src/domain/preset-copy";
import { runServerModeration } from "@/src/lib/moderation";
import { deleteTelegramModerationMessage, notifyModeratorOfPendingPreset } from "@/src/infrastructure/telegram";
import { decodeMapPlaylistExport } from "@/src/domain/map-playlist-export";
import { decodeSwapperExport } from "@/src/domain/swapper-export";
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
import { stripColorAndFormattingTags } from "@/src/domain/straftat-markup";
import {
  DEFAULT_PRESET_LIMIT,
  PresetLimitReachedError,
} from "@/src/domain/preset-policy";
import {
  thumbnailKeysToDeleteAfterDraftSave,
  thumbnailKeysToDeleteAfterPublish,
} from "@/src/domain/thumbnail-policy";
import {
  deriveUserPresetState,
  MAX_PRESET_SUBMISSIONS_PER_HOUR,
  ONE_HOUR_MS,
  planPresetEdit,
  PRESET_SUBMISSION_COOLDOWN_MS,
  validatePresetRevision,
  type PresetIssue,
  type PresetRevisionStatus,
} from "@/src/domain/preset-workflow";

const dashboardRevision = alias(presetRevisions, "dashboard_revision");
const effectiveUserName = sql<string>`coalesce(${users.displayName}, ${users.name})`;

async function decodeRevisionContentData(content: PresetRevisionContent) {
  const issues: PresetIssue[] = [];
  const invalidPlaylistPrefixes = new Set<string>();
  const invalidSwapperPrefixes = new Set<string>();

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
          message: "The map playlist export is invalid.",
        });
        return { ...playlist, name: "", mapNames: [] };
      }
    })),
    weaponConfigurations: await Promise.all(version.weaponConfigurations.map(async (config, configIndex) => {
      if (config.kind !== "swapper") return config;
      if (!config.encodedValue.trim()) return config;
      try {
        const decoded = await decodeSwapperExport(config.encodedValue);
        const prefix = `versions.${versionIndex}.weaponConfigurations.${configIndex}`;
        if (decoded.invalidMaps.length > 0) {
          issues.push({
            source: "validation",
            field: `${prefix}.encodedValue`,
            code: "unsupported_swapper_map",
            message: `Swapper references unsupported map(s): ${decoded.invalidMaps.slice(0, 3).join(", ")}`,
          });
        }
        if (decoded.invalidWeapons.length > 0) {
          issues.push({
            source: "validation",
            field: `${prefix}.encodedValue`,
            code: "unsupported_swapper_weapon",
            message: `Swapper references unsupported weapon(s): ${decoded.invalidWeapons.slice(0, 3).join(", ")}`,
          });
        }
        return { ...config, name: decoded.name };
      } catch {
        const prefix = `versions.${versionIndex}.weaponConfigurations.${configIndex}`;
        invalidSwapperPrefixes.add(prefix);
        issues.push({
          source: "validation",
          field: `${prefix}.encodedValue`,
          code: "invalid_swapper_code",
          message: "The swapper settings export is invalid.",
        });
        return { ...config, name: "" };
      }
    })),
  })));
  issues.sort((left, right) => left.field.localeCompare(right.field));
  return { content: { ...content, versions }, issues, invalidPlaylistPrefixes, invalidSwapperPrefixes };
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
  copies: number | null;
  qualityScoreMilli: number | null;
  engagementScoreMilli: number | null;
  updatedAt: Date;
  publishedAt: Date | null;
};

function parseIssues(value: string): PresetIssue[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed as PresetIssue[] : [];
}

import { sha256Hex } from "@/src/lib/crypto-utils";
import { slugifyPresetTitle } from "@/src/domain/preset-content";

async function hashRevisionContent(contentJson: string) {
  return sha256Hex(contentJson);
}

const dashboardColumns = {
  id: presets.id,
  slug: presets.slug,
  authorId: presets.authorId,
  authorName: effectiveUserName,
  workingRevisionId: presets.workingRevisionId,
  publishedRevisionId: presets.publishedRevisionId,
  revisionId: dashboardRevision.id,
  revisionNumber: dashboardRevision.revisionNumber,
  revisionStatus: dashboardRevision.status,
  contentJson: dashboardRevision.contentJson,
  validationIssuesJson: dashboardRevision.validationIssuesJson,
  reviewIssuesJson: dashboardRevision.reviewIssuesJson,
  editVersion: dashboardRevision.editVersion,
  copies: presetStatistics.copiesTotal,
  qualityScoreMilli: presetStatistics.qualityScoreMilli,
  engagementScoreMilli: presetStatistics.engagementScoreMilli,
  updatedAt: dashboardRevision.updatedAt,
  publishedAt: presets.publishedAt,
};

type SearchCandidateRow = { presetId: string; score: number };
const MAX_SEARCH_CANDIDATES = 96;

function searchCandidateQuery(segment: string) {
  const matches = [
    ["title", 100] as const,
    ["author", 40] as const,
    ["description", 25] as const,
    ["secondary_text", 10] as const,
  ].flatMap(([column, score]) => {
    const match = buildFtsMatch(segment, column);
    return match ? [sql`select preset_id as presetId, ${score} as score from preset_search_fts where preset_search_fts match ${match}`] : [];
  });

  const normalized = normalizeSearchValue(segment);
  const structuredMatches = [sql`
    select ${presetTags.presetId} as presetId, 90 as score
    from ${presetTags}
    inner join ${tags} on ${tags.slug} = ${presetTags.tagSlug}
    where lower(${tags.label}) = ${normalized}
  `];

  const entities = resolveSearchEntities(segment);
  if (entities.weaponGameIds.length) {
    structuredMatches.push(sql`
      select ${presetSearchTerms.presetId} as presetId, 70 as score
      from ${presetSearchTerms}
      where ${presetSearchTerms.field} in ('randomized_weapon', 'swapper_result')
        and ${presetSearchTerms.value} in (${sql.join(entities.weaponGameIds.map((value) => sql`${value}`), sql`, `)})
    `);
  }
  if (entities.mapNames.length) {
    structuredMatches.push(sql`
      select ${presetSearchTerms.presetId} as presetId, 70 as score
      from ${presetSearchTerms}
      where ${presetSearchTerms.field} = 'map'
        and ${presetSearchTerms.value} in (${sql.join(entities.mapNames.map((value) => sql`${value}`), sql`, `)})
    `);
  }
  matches.push(sql`
    select presetId, max(score) as score
    from (${sql.join(structuredMatches, sql` union all `)})
    group by presetId
  `);

  return sql<SearchCandidateRow>`
    select presetId, max(score) as score
    from (${sql.join(matches, sql` union all `)})
    group by presetId
    order by score desc, presetId asc
    limit ${MAX_SEARCH_CANDIDATES}
  `;
}

function exactTagCandidateQuery(tagSlug: string) {
  return sql<SearchCandidateRow>`
    select ${presetTags.presetId} as presetId, 90 as score
    from ${presetTags}
    where ${presetTags.tagSlug} = ${tagSlug}
    limit ${MAX_SEARCH_CANDIDATES}
  `;
}

function exactWeaponCandidateQuery(gameId: string) {
  return sql<SearchCandidateRow>`
    select ${presetSearchTerms.presetId} as presetId, 70 as score
    from ${presetSearchTerms}
    where ${presetSearchTerms.field} in ('randomized_weapon', 'swapper_result')
      and ${presetSearchTerms.value} = ${gameId}
    limit ${MAX_SEARCH_CANDIDATES}
  `;
}

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

function telegramRejectionDecision(issues: readonly PresetIssue[]): "text" | "picture" | "spam" {
  if (issues.some((issue) => issue.code === "picture_rejected")) return "picture";
  if (issues.some((issue) => issue.code === "spam")) return "spam";
  return "text";
}

export class D1Repository implements HealthRepository, PresetInteractionRepository, PresetThumbnailRepository, PresetWorkflowRepository, TagRepository, UserRepository {
  constructor(private readonly database: AppDatabase) {}

  async ping() {
    await this.database.run(sql`select 1`);
  }

  async upsertDiscordUser(id: string, name: string) {
    const now = new Date();
    const user = await this.database.insert(users).values({ id, name, lastLoginAt: now, createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: users.id,
      set: { name, lastLoginAt: now, updatedAt: now },
    }).returning({
      isActive: users.isActive,
      providerName: users.name,
      customDisplayName: users.displayName,
      displayNameConfiguredAt: users.displayNameConfiguredAt,
      presetLimit: users.presetLimit,
    }).get();
    if (!user) throw new Error("Signed-in user could not be read back.");
    const profile = {
      displayName: user.customDisplayName ?? user.providerName ?? name,
      hasCustomDisplayName: user.customDisplayName !== null && user.customDisplayName !== undefined,
      hasConfiguredDisplayName: user.displayNameConfiguredAt !== null && user.displayNameConfiguredAt !== undefined,
      presetLimit: user.presetLimit,
    };
    const publishedPresetIds = this.database.select({ id: presets.id })
      .from(presets)
      .where(and(eq(presets.authorId, id), eq(presets.status, "published")));
    const searchableDisplayName = stripColorAndFormattingTags(profile.displayName);
    await this.database.update(presetSearchDocuments).set({ author: searchableDisplayName, updatedAt: now }).where(and(
      ne(presetSearchDocuments.author, searchableDisplayName),
      inArray(presetSearchDocuments.presetId, publishedPresetIds),
    )).run();
    return { isActive: user.isActive, profile };
  }

  async getUserProfile(id: string) {
    const user = await this.database.select({
      providerName: users.name,
      customDisplayName: users.displayName,
      displayNameConfiguredAt: users.displayNameConfiguredAt,
      presetLimit: users.presetLimit,
    })
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)))
      .get();
    if (!user) return undefined;
    return {
      displayName: user.customDisplayName ?? user.providerName,
      hasCustomDisplayName: user.customDisplayName !== null,
      hasConfiguredDisplayName: user.displayNameConfiguredAt !== null,
      presetLimit: user.presetLimit,
    };
  }

  async updateUserDisplayName(id: string, displayName: string | null) {
    const now = new Date();
    const existingUser = await this.database.select({ providerName: users.name })
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)))
      .get();
    if (!existingUser) return undefined;
    const effectiveDisplayName = displayName ?? existingUser.providerName;
    const searchableDisplayName = stripColorAndFormattingTags(effectiveDisplayName);
    const publishedPresetIds = this.database.select({ id: presets.id })
      .from(presets)
      .where(and(eq(presets.authorId, id), eq(presets.status, "published")));
    const [updatedUsers] = await this.database.batch([
      this.database.update(users).set({ displayName, displayNameConfiguredAt: now, updatedAt: now })
        .where(and(eq(users.id, id), eq(users.isActive, true)))
        .returning({
          providerName: users.name,
          customDisplayName: users.displayName,
          displayNameConfiguredAt: users.displayNameConfiguredAt,
          presetLimit: users.presetLimit,
        }),
      this.database.update(presetSearchDocuments).set({ author: searchableDisplayName, updatedAt: now }).where(and(
        ne(presetSearchDocuments.author, searchableDisplayName),
        inArray(presetSearchDocuments.presetId, publishedPresetIds),
      )),
    ]);
    const user = updatedUsers[0];
    if (!user) return undefined;
    const profile = {
      displayName: user.customDisplayName ?? user.providerName,
      hasCustomDisplayName: user.customDisplayName !== null,
      hasConfiguredDisplayName: user.displayNameConfiguredAt !== null,
      presetLimit: user.presetLimit,
    };
    return profile;
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

    const currentTags = await this.database.select({ slug: presetTags.tagSlug })
      .from(presetTags)
      .where(eq(presetTags.presetId, presetId))
      .orderBy(asc(presetTags.position))
      .all();
    if (currentTags.length === tagSlugs.length && currentTags.every((tag, index) => tag.slug === tagSlugs[index])) return;

    const removeExisting = this.database.delete(presetTags).where(eq(presetTags.presetId, presetId));
    if (!tagSlugs.length) {
      await removeExisting.run();
      await this.recalculatePresetStatistics(presetId);
      return;
    }
    const addRequested = this.database.insert(presetTags).values(tagSlugs.map((tagSlug, position) => ({ presetId, tagSlug, position })));
    await this.database.batch([removeExisting, addRequested]);
    await this.recalculatePresetStatistics(presetId);
  }

  async createPresetDraft(userId: string, title: string, now = new Date()): Promise<PresetDashboardItem> {
    await this.database.insert(users).values({
      id: userId,
      name: "Discord user",
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing().run();

    const author = await this.database.select({ presetLimit: users.presetLimit }).from(users).where(eq(users.id, userId)).get();
    const authorLimit = author?.presetLimit ?? DEFAULT_PRESET_LIMIT;
    const existingCount = await this.database
      .select({ value: count() })
      .from(presets)
      .where(eq(presets.authorId, userId))
      .get();

    if ((existingCount?.value ?? 0) >= authorLimit) {
      throw new PresetLimitReachedError(authorLimit);
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
        items: await Promise.all((rows as DashboardRow[]).map((row) => this.toDashboardItem(row, userId))),
        total: Number(total?.value ?? 0),
      };
    }

    const condition = and(eq(presets.status, "published"), sql`${presets.publishedRevisionId} is not null`);
    const baseQuery = () => this.database.select(dashboardColumns).from(presets)
      .innerJoin(users, eq(users.id, presets.authorId))
      .innerJoin(dashboardRevision, eq(dashboardRevision.id, presets.publishedRevisionId))
      .leftJoin(presetStatistics, eq(presetStatistics.presetId, presets.id))
      .where(condition);
    const rows = (view === "newest" || view === "updated")
      ? await baseQuery().orderBy(desc(presets.updatedAt), asc(presets.id)).limit(limit).offset(offset).all()
      : await baseQuery().orderBy(
        desc(sql`coalesce(${presetStatistics.qualityScoreMilli}, 0) + coalesce(${presetStatistics.engagementScoreMilli}, 0)`),
        desc(presets.updatedAt),
        asc(presets.id),
      ).limit(limit).offset(offset).all();
    const total = await this.database.select({ value: count() }).from(presets).where(condition).get();

    return {
      items: await Promise.all((rows as DashboardRow[]).map((row) => this.toDashboardItem(row, userId))),
      total: Number(total?.value ?? 0),
    };
  }

  async searchPublishedPresets(input: PresetSearchInput, userId?: string) {
    const candidateQueries = [
      ...splitSearchQuery(input.query).map(searchCandidateQuery),
      ...input.tagSlugs.map(exactTagCandidateQuery),
      ...input.weaponGameIds.map(exactWeaponCandidateQuery),
    ];
    if (!candidateQueries.length) return { items: [], total: 0 };

    const candidateAliases = candidateQueries.map((_, index) => sql.identifier(`criterion_${index}`));
    const candidateQuery = sql<SearchCandidateRow>`
      select ${candidateAliases[0]}.presetId as presetId,
        ${sql.join(candidateAliases.map((candidateAlias) => sql`${candidateAlias}.score`), sql` + `)} as score
      from (${candidateQueries[0]}) as ${candidateAliases[0]}
      ${sql.join(candidateQueries.slice(1).map((query, index) => sql`
        inner join (${query}) as ${candidateAliases[index + 1]}
          on ${candidateAliases[index + 1]}.presetId = ${candidateAliases[0]}.presetId
      `), sql` `)}
      order by score desc, presetId asc
      limit ${MAX_SEARCH_CANDIDATES}
    `;
    const candidates = await this.database.all<SearchCandidateRow>(candidateQuery);
    const scores = new Map(candidates.map((candidate) => [candidate.presetId, Number(candidate.score)]));
    if (!scores.size) return { items: [], total: 0 };

    const candidateIds = [...scores.keys()];
    const visibility = and(
      eq(presets.status, "published"),
      isNotNull(presets.publishedRevisionId),
      eq(presetSearchDocuments.schemaVersion, PRESET_SEARCH_SCHEMA_VERSION),
      eq(presetSearchDocuments.publishedRevisionId, presets.publishedRevisionId),
      input.authorId ? eq(presets.authorId, input.authorId) : undefined,
      inArray(presets.id, candidateIds),
    );
    const rows = await this.database.select(dashboardColumns).from(presets)
      .innerJoin(users, eq(users.id, presets.authorId))
      .innerJoin(dashboardRevision, eq(dashboardRevision.id, presets.publishedRevisionId))
      .innerJoin(presetSearchDocuments, eq(presetSearchDocuments.presetId, presets.id))
      .leftJoin(presetStatistics, eq(presetStatistics.presetId, presets.id))
      .where(visibility)
      .all() as DashboardRow[];

    rows.sort((left, right) => {
      const relevance = (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0);
      if (relevance) return relevance;
      if (input.order === "updated") {
        return right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id);
      }
      const rightPopularity = Number(right.qualityScoreMilli ?? 0) + Number(right.engagementScoreMilli ?? 0);
      const leftPopularity = Number(left.qualityScoreMilli ?? 0) + Number(left.engagementScoreMilli ?? 0);
      return rightPopularity - leftPopularity || right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id);
    });

    const total = rows.length;
    const page = rows.slice(input.offset, input.offset + input.limit);
    return { items: await Promise.all(page.map((row) => this.toDashboardItem(row, userId))), total };
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

  async getRevisionModerationContext(revisionId: string): Promise<RevisionModerationContext | undefined> {
    const row = await this.database.select({
      presetId: presetRevisions.presetId,
      status: presetRevisions.status,
      telegramChatId: presetRevisions.telegramChatId,
      telegramMessageId: presetRevisions.telegramMessageId,
      telegramMessageKind: presetRevisions.telegramMessageKind,
      telegramMessageHtml: presetRevisions.telegramMessageHtml,
      telegramDecision: presetRevisions.telegramDecision,
      telegramResolvedAt: presetRevisions.telegramResolvedAt,
    }).from(presetRevisions).where(eq(presetRevisions.id, revisionId)).get();
    if (!row) return undefined;
    return {
      presetId: row.presetId,
      status: row.status,
      decision: row.telegramDecision,
      message: this.toTelegramModerationMessage(revisionId, row),
    };
  }

  async clearTelegramModerationMessage(revisionId: string, messageId: number) {
    const update = await this.database.update(presetRevisions).set({
      telegramChatId: null,
      telegramMessageId: null,
      telegramMessageKind: null,
      telegramMessageHtml: null,
      telegramDecision: null,
      telegramResolvedAt: null,
    }).where(and(
      eq(presetRevisions.id, revisionId),
      eq(presetRevisions.telegramMessageId, messageId),
      isNull(presetRevisions.telegramResolvedAt),
    )).run();
    return Number(update.meta.changes) === 1;
  }

  async findPresetIdByTelegramMessageId(messageId: number): Promise<string | undefined> {
    const row = await this.database.select({
      presetId: presetRevisions.presetId,
    }).from(presetRevisions).where(eq(presetRevisions.telegramMessageId, messageId)).get();
    return row?.presetId;
  }

  private toTelegramModerationMessage(
    revisionId: string,
    row: {
      telegramChatId: string | null;
      telegramMessageId: number | null;
      telegramMessageKind: "text" | "photo" | null;
      telegramMessageHtml: string | null;
      telegramResolvedAt: Date | null;
    },
  ): TelegramModerationMessage | undefined {
    if (row.telegramChatId === null || row.telegramMessageId === null || row.telegramMessageKind === null || row.telegramMessageHtml === null) return undefined;
    return {
      revisionId,
      chatId: row.telegramChatId,
      messageId: row.telegramMessageId,
      kind: row.telegramMessageKind,
      html: row.telegramMessageHtml,
      resolvedAt: row.telegramResolvedAt,
    };
  }

  private async attachTelegramModerationMessage(message: TelegramModerationMessage, now: Date) {
    const update = await this.database.update(presetRevisions).set({
      telegramChatId: message.chatId,
      telegramMessageId: message.messageId,
      telegramMessageKind: message.kind,
      telegramMessageHtml: message.html,
      telegramDecision: null,
      telegramResolvedAt: null,
      updatedAt: now,
    }).where(and(
      eq(presetRevisions.id, message.revisionId),
      eq(presetRevisions.status, "pending"),
      isNull(presetRevisions.telegramMessageId),
    )).run();
    return Number(update.meta.changes) === 1;
  }

  private async listUnresolvedTelegramMessages(presetId: string, currentRevisionId: string) {
    const rows = await this.database.select({
      revisionId: presetRevisions.id,
      telegramChatId: presetRevisions.telegramChatId,
      telegramMessageId: presetRevisions.telegramMessageId,
      telegramMessageKind: presetRevisions.telegramMessageKind,
      telegramMessageHtml: presetRevisions.telegramMessageHtml,
      telegramResolvedAt: presetRevisions.telegramResolvedAt,
    }).from(presetRevisions).where(and(
      eq(presetRevisions.presetId, presetId),
      ne(presetRevisions.id, currentRevisionId),
      isNull(presetRevisions.telegramResolvedAt),
      sql`${presetRevisions.telegramMessageId} is not null`,
    )).all();
    return rows.flatMap((row) => {
      const message = this.toTelegramModerationMessage(row.revisionId, row);
      return message ? [message] : [];
    });
  }

  private async deleteUnresolvedTelegramMessages(messages: readonly TelegramModerationMessage[]) {
    for (const message of messages) {
      if (!await deleteTelegramModerationMessage(message)) continue;
      await this.clearTelegramModerationMessage(message.revisionId, message.messageId);
    }
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
      if (!envelope.publishedRevisionId || content.thumbnailKey !== envelope.thumbnailKey) {
        await this.database.update(presets).set({
          ...thumbnailUpdate,
          ...(envelope.publishedRevisionId ? {} : { title: content.title, description: content.description, slug: slugifyPresetTitle(content.title, input.presetId) }),
          updatedAt: now,
        }).where(eq(presets.id, input.presetId)).run();
      }
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

  async submitPreset(input: { presetId: string; userId: string; revisionId: string; editVersion: number; now?: Date }): Promise<PresetSubmitResult> {
    const now = input.now ?? new Date();
    const revision = await this.database.select({
      authorId: presets.authorId,
      authorName: effectiveUserName,
      userSuspendedUntil: users.suspendedUntil,
      resubmissionBlockedUntil: presets.resubmissionBlockedUntil,
      workingRevisionId: presets.workingRevisionId,
      publishedRevisionId: presets.publishedRevisionId,
      status: presetRevisions.status,
      editVersion: presetRevisions.editVersion,
      contentJson: presetRevisions.contentJson,
      thumbnailKey: presets.thumbnailKey,
      thumbnailModerationStatus: presets.thumbnailModerationStatus,
    }).from(presets)
      .innerJoin(presetRevisions, eq(presetRevisions.id, presets.workingRevisionId))
      .innerJoin(users, eq(users.id, presets.authorId))
      .where(eq(presets.id, input.presetId))
      .get();
    if (!revision) return { result: "not_found" };
    if (revision.authorId !== input.userId) return { result: "forbidden" };
    if (revision.workingRevisionId !== input.revisionId || revision.status !== "draft" || revision.editVersion !== input.editVersion) return { result: "conflict" };

    if (revision.userSuspendedUntil && new Date(revision.userSuspendedUntil).getTime() > now.getTime()) {
      const daysLeft = Math.max(1, Math.ceil((new Date(revision.userSuspendedUntil).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      return {
        result: "rate_limited",
        message: `Your account is temporarily suspended from submitting presets for ${daysLeft} more day${daysLeft === 1 ? "" : "s"} due to moderation action.`,
      };
    }

    if (revision.resubmissionBlockedUntil && new Date(revision.resubmissionBlockedUntil).getTime() > now.getTime()) {
      const daysLeft = Math.max(1, Math.ceil((new Date(revision.resubmissionBlockedUntil).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      return {
        result: "rate_limited",
        message: `This preset was retracted by moderation and cannot be resubmitted for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}.`,
      };
    }

    const storedContent = parsePresetRevisionContent(JSON.parse(revision.contentJson));
    const decoded = await decodeRevisionContentData(storedContent);
    const content = parsePresetRevisionContent(decoded.content);

    const previousPublished = revision.publishedRevisionId
      ? await this.database.select({
          contentJson: presetRevisions.contentJson,
        }).from(presetRevisions).where(eq(presetRevisions.id, revision.publishedRevisionId)).get()
      : null;
    const previousContent = previousPublished ? parsePresetRevisionContent(JSON.parse(previousPublished.contentJson)) : null;

    if (previousContent) {
      const isContentIdentical = JSON.stringify(content) === JSON.stringify(previousContent);
      const isThumbnailIdentical = (revision.thumbnailKey ?? null) === (previousContent.thumbnailKey ?? null);
      if (isContentIdentical && isThumbnailIdentical) {
        return { result: "no_changes", message: "No changes have been made to publish." };
      }
    }

    const lastSubmissionOnPreset = await this.database.select({
      submittedAt: presetRevisions.submittedAt,
    }).from(presetRevisions)
      .where(and(
        eq(presetRevisions.presetId, input.presetId),
        isNotNull(presetRevisions.submittedAt),
      ))
      .orderBy(desc(presetRevisions.submittedAt))
      .limit(1)
      .get();

    if (lastSubmissionOnPreset?.submittedAt) {
      const elapsed = now.getTime() - new Date(lastSubmissionOnPreset.submittedAt).getTime();
      if (elapsed < PRESET_SUBMISSION_COOLDOWN_MS) {
        const remainingSeconds = Math.max(1, Math.ceil((PRESET_SUBMISSION_COOLDOWN_MS - elapsed) / 1000));
        return {
          result: "rate_limited",
          message: `Please wait ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"} before submitting again.`,
          retryAfterSeconds: remainingSeconds,
        };
      }
    }

    // Hourly submission limit temporarily disabled for testing
    /*
    const oneHourAgo = new Date(now.getTime() - ONE_HOUR_MS);
    const recentAuthorSubmissions = await this.database.select({
      count: sql<number>`count(*)`,
    }).from(presetRevisions)
      .innerJoin(presets, eq(presets.id, presetRevisions.presetId))
      .where(and(
        eq(presets.authorId, input.userId),
        gte(presetRevisions.submittedAt, oneHourAgo),
      ))
      .get();

    if ((recentAuthorSubmissions?.count ?? 0) >= MAX_PRESET_SUBMISSIONS_PER_HOUR) {
      return {
        result: "rate_limited",
        message: "You have reached the limit of 10 submissions per hour. Please try again later.",
      };
    }
    */

    const contentIssues = validatePresetRevision(content, { isInitialPublication: !revision.publishedRevisionId })
      .filter((issue) => !["missing_playlist_name", "empty_map_playlist"].includes(issue.code) || ![...decoded.invalidPlaylistPrefixes].some((prefix) => issue.field.startsWith(prefix)))
      .filter((issue) => !["missing_swapper_code", "invalid_swapper_code"].includes(issue.code) || ![...decoded.invalidSwapperPrefixes].some((prefix) => issue.field.startsWith(prefix)));
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

    const unresolvedMessages = await this.listUnresolvedTelegramMessages(input.presetId, input.revisionId);

    const modResult = await runServerModeration(content, { previousContent });
    const isThumbnailApproved =
      revision.thumbnailModerationStatus === "approved" ||
      revision.thumbnailModerationStatus === "not_submitted" ||
      (previousContent !== null && revision.thumbnailKey === previousContent.thumbnailKey);

    if (modResult.decision === "rejected") {
      const rejected = await this.reviewPreset({
        presetId: input.presetId,
        revisionId: input.revisionId,
        reviewerId: null,
        decision: "reject",
        issues: modResult.flags
          .map((flag) => ({
            source: "moderation",
            field: flag.field,
            code: flag.code,
            message: flag.message,
          })),
        now,
      });
      if (rejected.result === "updated") await this.deleteUnresolvedTelegramMessages(unresolvedMessages);
      return rejected;
    }

    if (modResult.decision === "approved" && isThumbnailApproved) {
      const autoReview = await this.reviewPreset({ presetId: input.presetId, revisionId: input.revisionId, reviewerId: null, decision: "approve", issues: [], now });
      if (autoReview.result === "updated") {
        await this.deleteUnresolvedTelegramMessages(unresolvedMessages);
        return autoReview;
      }
    } else {
      const thumbnailUrl = revision.thumbnailKey ? `/api/media/${revision.thumbnailKey}` : undefined;
      const notification = await notifyModeratorOfPendingPreset({
        revisionId: input.revisionId,
        authorName: revision.authorName,
        content,
        previousContent,
        requiresTextReview: modResult.decision === "review_required",
        thumbnailUrl,
      }).catch((err) => {
        console.error("Failed to notify moderator on Telegram:", err);
        return undefined;
      });
      if (notification) {
        const attached = await this.attachTelegramModerationMessage(notification, now);
        if (attached) await this.deleteUnresolvedTelegramMessages(unresolvedMessages);
        else await deleteTelegramModerationMessage(notification);
      }
    }

    const submitted = await this.getPresetForViewer(input.presetId, input.userId);
    return submitted ? { result: "updated", preset: submitted } : { result: "conflict" };
  }

  async reviewPreset(input: { presetId: string; revisionId: string; reviewerId: string | null; decision: "approve" | "reject"; issues: PresetIssue[]; now?: Date }): Promise<PresetReviewResult> {
    const now = input.now ?? new Date();
    const revision = await this.database.select({
      authorId: presets.authorId,
      authorName: effectiveUserName,
      workingRevisionId: presets.workingRevisionId,
      publishedRevisionId: presets.publishedRevisionId,
      publishedAt: presets.publishedAt,
      status: presetRevisions.status,
      contentJson: presetRevisions.contentJson,
    }).from(presets)
      .innerJoin(presetRevisions, eq(presetRevisions.id, presets.workingRevisionId))
      .innerJoin(users, eq(users.id, presets.authorId))
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
        telegramDecision: telegramRejectionDecision(reviewIssues),
        telegramResolvedAt: now,
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
    const searchProjection = await buildPresetSearchProjection(content, revision.authorName);

    const statements: BatchItem<"sqlite">[] = [
      this.database.delete(presetSearchDocuments).where(eq(presetSearchDocuments.presetId, input.presetId)),
      this.database.delete(presetTags).where(eq(presetTags.presetId, input.presetId)),
      this.database.delete(presetVersions).where(eq(presetVersions.presetId, input.presetId)),
      this.database.insert(presetSearchDocuments).values({
        presetId: input.presetId,
        publishedRevisionId: input.revisionId,
        schemaVersion: searchProjection.document.schemaVersion,
        title: searchProjection.document.title,
        author: searchProjection.document.author,
        description: searchProjection.document.description,
        secondaryText: searchProjection.document.secondaryText,
        updatedAt: now,
      }),
    ];
    const SEARCH_TERMS_CHUNK_SIZE = 20;
    for (let i = 0; i < searchProjection.terms.length; i += SEARCH_TERMS_CHUNK_SIZE) {
      const chunk = searchProjection.terms.slice(i, i + SEARCH_TERMS_CHUNK_SIZE);
      statements.push(this.database.insert(presetSearchTerms).values(
        chunk.map((term) => ({
          presetId: input.presetId,
          publishedRevisionId: input.revisionId,
          field: term.field,
          value: term.value,
        })),
      ));
    }
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
        telegramDecision: "approve",
        telegramResolvedAt: now,
        reviewedAt: now,
        updatedAt: now,
      }).where(and(eq(presetRevisions.id, input.revisionId), eq(presetRevisions.status, "pending"))),
      this.database.update(presets).set({
        title: content.title,
        description: content.description,
        thumbnailKey: content.thumbnailKey,
        thumbnailModerationStatus: content.thumbnailKey === null ? "not_submitted" as const : "approved" as const,
        thumbnailModerationData: content.thumbnailKey === null ? null : JSON.stringify({ provider: "manual_telegram_review", decision: "approved" }),
        thumbnailModeratedAt: content.thumbnailKey === null ? null : now,
        status: "published",
        workingRevisionId: null,
        publishedRevisionId: input.revisionId,
        publishedAt: revision.publishedAt ?? now,
        updatedAt: now,
      }).where(and(eq(presets.id, input.presetId), eq(presets.workingRevisionId, input.revisionId))),
    );

    const BATCH_CHUNK_SIZE = 50;
    try {
      for (let i = 0; i < statements.length; i += BATCH_CHUNK_SIZE) {
        const chunk = statements.slice(i, i + BATCH_CHUNK_SIZE);
        await this.database.batch(chunk as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
      }
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

    await this.database.batch([
      this.database.delete(presetSearchDocuments).where(eq(presetSearchDocuments.presetId, presetId)),
      this.database.delete(presets).where(and(eq(presets.id, presetId), eq(presets.authorId, userId))),
    ]);
    return { result: "deleted" };
  }

  async retractPreset(input: {
    identifier: string;
    reason?: string;
    suspensionDays?: number;
    reviewerId?: string | null;
    now?: Date;
  }): Promise<PresetRetractResult> {
    const now = input.now ?? new Date();
    const cleanId = input.identifier.trim().replace(/^https?:\/\/[^/]+\/(?:\?p=|\/p\/|\/api\/presets\/)?/i, "").replace(/^\?p=/, "").trim();

    const preset = await this.database.select({
      id: presets.id,
      slug: presets.slug,
      authorId: presets.authorId,
      title: presets.title,
      status: presets.status,
      workingRevisionId: presets.workingRevisionId,
      publishedRevisionId: presets.publishedRevisionId,
      authorName: effectiveUserName,
    }).from(presets)
      .innerJoin(users, eq(users.id, presets.authorId))
      .where(or(eq(presets.id, cleanId), eq(presets.slug, cleanId)))
      .get();

    if (!preset) return { result: "not_found" };
    if (preset.status !== "published" && !preset.publishedRevisionId) return { result: "not_published" };

    const days = input.suspensionDays ?? 7;
    const suspendedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const reasonText = input.reason?.trim() || "Prohibited or invalid content.";

    const retractionIssue: PresetIssue = {
      source: "moderation",
      field: "content",
      code: "retracted",
      message: `Preset retracted: ${reasonText} Submissions are blocked for ${days} days.`,
    };

    const statements: BatchItem<"sqlite">[] = [
      this.database.delete(presetSearchDocuments).where(eq(presetSearchDocuments.presetId, preset.id)),
      this.database.update(presets).set({
        status: "draft",
        publishedRevisionId: null,
        publishedAt: null,
        resubmissionBlockedUntil: suspendedUntil,
        retractedAt: now,
        retractedReason: reasonText,
        updatedAt: now,
      }).where(eq(presets.id, preset.id)),

      this.database.update(users).set({
        suspendedUntil,
        updatedAt: now,
      }).where(eq(users.id, preset.authorId)),
    ];

    if (preset.publishedRevisionId) {
      statements.push(
        this.database.update(presetRevisions).set({
          status: "rejected",
          reviewIssuesJson: JSON.stringify([retractionIssue]),
          reviewedAt: now,
          reviewerId: input.reviewerId ?? null,
          updatedAt: now,
        }).where(eq(presetRevisions.id, preset.publishedRevisionId)),
      );
    }

    if (preset.workingRevisionId && preset.workingRevisionId !== preset.publishedRevisionId) {
      statements.push(
        this.database.update(presetRevisions).set({
          status: "rejected",
          reviewIssuesJson: JSON.stringify([retractionIssue]),
          reviewedAt: now,
          reviewerId: input.reviewerId ?? null,
          updatedAt: now,
        }).where(eq(presetRevisions.id, preset.workingRevisionId)),
      );
    }

    await this.database.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    await this.recalculatePresetStatistics(preset.id, now);

    const updated = await this.getPresetForViewer(preset.id, preset.authorId);
    return {
      result: "retracted",
      preset: updated!,
      authorName: preset.authorName,
      title: preset.title,
      suspendedUntil,
    };
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
    const preset = await this.database.select({
      id: presets.id,
      status: presets.status,
      publishedRevisionId: presets.publishedRevisionId,
    }).from(presets).where(or(eq(presets.id, input.presetId), eq(presets.slug, input.presetId))).get();
    if (!preset || preset.status !== "published") return { result: input.kind === "copy" ? "ignored" : "not_found" };

    const resolvedPresetId = preset.id;
    if (input.kind === "copy") {
      const target = input.copyTarget;
      if (!target || target.publicationId !== preset.publishedRevisionId) {
        return { result: "ignored" };
      }
      const publishedRevision = await this.database.select({ contentJson: presetRevisions.contentJson })
        .from(presetRevisions)
        .where(and(
          eq(presetRevisions.id, target.publicationId),
          eq(presetRevisions.presetId, resolvedPresetId),
          eq(presetRevisions.status, "published"),
        ))
        .get();
      if (!publishedRevision) {
        return { result: "ignored" };
      }
      try {
        const content = parsePresetRevisionContent(JSON.parse(publishedRevision.contentJson));
        const manifest = await createPresetCopyManifest(target.publicationId, content);
        if (!copyTargetKeys(manifest).has(target.targetKey)) {
          return { result: "ignored" };
        }
      } catch (error) {
        console.error(JSON.stringify({
          message: "published copy targets are invalid",
          presetId: resolvedPresetId,
          revisionId: target.publicationId,
          error: error instanceof Error ? error.message : String(error),
        }));
        return { result: "ignored" };
      }
    }

    const existingClientEvent = await this.database.select({ id: presetEvents.id }).from(presetEvents)
      .where(and(eq(presetEvents.presetId, resolvedPresetId), eq(presetEvents.clientEventId, input.clientEventId)))
      .get();
    if (existingClientEvent) return { result: "duplicate" };

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
        kind: input.kind,
        actorHash: input.actorHash,
        networkHash: input.networkHash,
        isAuthenticated: input.isAuthenticated,
        clientEventId: input.clientEventId,
        targetKey: input.copyTarget?.targetKey ?? "",
        dedupeBucket: input.dedupeBucket,
        createdAt: input.occurredAt,
      });
      const recordActor = this.database.insert(presetUniqueActors).values({
        presetId: resolvedPresetId,
        kind: input.kind,
        actorHash: input.actorHash,
        isAuthenticated: input.isAuthenticated,
        firstSeenAt: input.occurredAt,
      }).onConflictDoNothing();
      await this.database.batch([insertEvent, recordActor]);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const retry = await this.database.select({ id: presetEvents.id }).from(presetEvents)
        .where(and(eq(presetEvents.presetId, resolvedPresetId), eq(presetEvents.clientEventId, input.clientEventId)))
        .get();
      if (!retry) await this.recordAbuseSignal(resolvedPresetId, input.kind, "duplicate", input.dayBucket, input.actorHash, input.networkHash ?? "", input.occurredAt);
      return { result: "duplicate" };
    }

    return { result: "counted", statistics: await this.recalculatePresetStatistics(resolvedPresetId, input.occurredAt) };
  }

  async recalculatePresetStatistics(presetId: string, now = new Date()): Promise<PresetStatisticsSnapshot | undefined> {
    const preset = await this.database.select({
      title: presets.title,
      description: presets.description,
      thumbnailKey: presets.thumbnailKey,
      publishedAt: presets.publishedAt,
    }).from(presets).where(eq(presets.id, presetId)).get();
    if (!preset) return undefined;

    const [versionTotal, playlistTotal, playlistWithDescTotal, tagTotal, weaponTotal, eventTotals, uniqueTotals, abuseTotal, latestEvent] = await Promise.all([
      this.database.select({ value: count() }).from(presetVersions).where(eq(presetVersions.presetId, presetId)).get(),
      this.database.select({ value: count() }).from(mapPlaylists).innerJoin(presetVersions, eq(mapPlaylists.presetVersionId, presetVersions.id)).where(eq(presetVersions.presetId, presetId)).get(),
      this.database.select({ value: count() }).from(mapPlaylists).innerJoin(presetVersions, eq(mapPlaylists.presetVersionId, presetVersions.id)).where(and(eq(presetVersions.presetId, presetId), ne(mapPlaylists.description, ""))).get(),
      this.database.select({ value: count() }).from(presetTags).where(eq(presetTags.presetId, presetId)).get(),
      this.database.select({ value: count() }).from(weaponConfigurations).innerJoin(presetVersions, eq(weaponConfigurations.presetVersionId, presetVersions.id)).where(eq(presetVersions.presetId, presetId)).get(),
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
      opens: interactions.view,
      linkOpens: interactions.link_open,
      copies: interactions.copy,
    };
    const ranking = calculatePresetRanking(content, engagement, preset.publishedAt, now);
    const snapshot: PresetStatisticsSnapshot = {
      opens: engagement.opens,
      linkOpens: engagement.linkOpens,
      copies: engagement.copies,
      abuseSignals: Number(abuseTotal?.value ?? 0),
      ranking,
    };
    const values = {
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

  private async toDashboardItem(row: DashboardRow, userId: string | undefined): Promise<PresetDashboardItem> {
    const isOwner = row.authorId === userId;
    const workingStatus = isOwner && ["draft", "pending", "rejected"].includes(row.revisionStatus) ? row.revisionStatus : null;
    const content = parsePresetRevisionContent(JSON.parse(row.contentJson));
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
      content,
      copyManifest: row.publishedRevisionId === row.revisionId
        ? await createPresetCopyManifest(row.revisionId, content)
        : null,
      issues: isOwner ? [...parseIssues(row.validationIssuesJson), ...parseIssues(row.reviewIssuesJson)] : [],
      copies: Number(row.copies ?? 0),
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

  private async recordAbuseSignal(presetId: string, kind: PresetEventKind, reason: "duplicate" | "network_limit", dayBucket: string, actorHash: string, networkHash: string, occurredAt: Date) {
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
