import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["member", "moderator", "admin"] }).notNull().default("member"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }).notNull().default(now),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const gameReleases = sqliteTable("game_releases", {
  version: text("version").primaryKey(),
  publishedAt: text("published_at").notNull(),
  sourceUrl: text("source_url").notNull(),
  catalogHash: text("catalog_hash").notNull(),
  isSupported: integer("is_supported", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [index("idx_game_releases_supported").on(table.isSupported)]);

export const gameWeapons = sqliteTable("game_weapons", {
  name: text("name").primaryKey(),
  imagePath: text("image_path").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [index("idx_game_weapons_active_name").on(table.isActive, table.name)]);

export const gameMaps = sqliteTable("game_maps", {
  name: text("name").primaryKey(),
  kind: text("kind", { enum: ["core", "alt", "dlc"] }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [index("idx_game_maps_active_name").on(table.isActive, table.name)]);

export const presets = sqliteTable("presets", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  thumbnailKey: text("thumbnail_key"),
  thumbnailModerationStatus: text("thumbnail_moderation_status", { enum: ["not_submitted", "approved", "needs_review", "rejected"] }).notNull().default("not_submitted"),
  thumbnailModerationData: text("thumbnail_moderation_data"),
  thumbnailModeratedAt: integer("thumbnail_moderated_at", { mode: "timestamp_ms" }),
  status: text("status", { enum: ["draft", "published", "hidden"] }).notNull().default("draft"),
  workingRevisionId: text("working_revision_id"),
  publishedRevisionId: text("published_revision_id"),
  revisionCounter: integer("revision_counter").notNull().default(0),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
}, (table) => [
  uniqueIndex("uq_presets_slug").on(table.slug),
  index("idx_presets_author_id").on(table.authorId),
  index("idx_presets_status_published_at").on(table.status, table.publishedAt),
]);

export const presetRevisions = sqliteTable("preset_revisions", {
  id: text("id").primaryKey(),
  presetId: text("preset_id").notNull().references(() => presets.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  sourceRevisionId: text("source_revision_id"),
  status: text("status", { enum: ["draft", "pending", "rejected", "published", "archived", "superseded"] }).notNull(),
  contentJson: text("content_json").notNull(),
  contentHash: text("content_hash").notNull(),
  validationIssuesJson: text("validation_issues_json").notNull().default("[]"),
  reviewIssuesJson: text("review_issues_json").notNull().default("[]"),
  editVersion: integer("edit_version").notNull().default(0),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  telegramChatId: text("telegram_chat_id"),
  telegramMessageId: integer("telegram_message_id"),
  telegramMessageKind: text("telegram_message_kind", { enum: ["text", "photo"] }),
  telegramMessageHtml: text("telegram_message_html"),
  telegramDecision: text("telegram_decision", { enum: ["approve", "text", "picture", "spam"] }),
  telegramResolvedAt: integer("telegram_resolved_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [
  check("preset_revisions_status_valid", sql`${table.status} IN ('draft', 'pending', 'rejected', 'published', 'archived', 'superseded')`),
  check("preset_revisions_content_valid", sql`json_valid(${table.contentJson}) AND length(${table.contentJson}) <= 900000`),
  check("preset_revisions_issues_valid", sql`json_valid(${table.validationIssuesJson}) AND json_valid(${table.reviewIssuesJson})`),
  uniqueIndex("uq_preset_revisions_number").on(table.presetId, table.revisionNumber),
  uniqueIndex("uq_preset_revisions_working").on(table.presetId).where(sql`${table.status} in ('draft', 'pending', 'rejected')`),
  index("idx_preset_revisions_moderation_queue").on(table.status, table.submittedAt),
  index("idx_preset_revisions_source").on(table.sourceRevisionId),
]);

export const tags = sqliteTable("tags", {
  slug: text("slug").primaryKey(),
  label: text("label").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [uniqueIndex("uq_tags_label").on(table.label), index("idx_tags_active_sort").on(table.isActive, table.sortOrder, table.label)]);

export const presetTags = sqliteTable("preset_tags", {
  presetId: text("preset_id").notNull().references(() => presets.id, { onDelete: "cascade" }),
  tagSlug: text("tag_slug").notNull().references(() => tags.slug, { onDelete: "restrict" }),
  position: integer("position").notNull(),
}, (table) => [
  primaryKey({ columns: [table.presetId, table.tagSlug] }),
  uniqueIndex("uq_preset_tags_position").on(table.presetId, table.position),
  index("idx_preset_tags_tag_slug").on(table.tagSlug),
]);

export const presetVersions = sqliteTable("preset_versions", {
  id: text("id").primaryKey(),
  presetId: text("preset_id").notNull().references(() => presets.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [
  uniqueIndex("uq_preset_versions_preset_label").on(table.presetId, table.label),
  index("idx_preset_versions_preset_id").on(table.presetId),
]);

export const mapPlaylists = sqliteTable("map_playlists", {
  id: text("id").primaryKey(),
  presetVersionId: text("preset_version_id").notNull().references(() => presetVersions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  encodedValue: text("encoded_value").notNull(),
  decodedMapCount: integer("decoded_map_count").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [index("idx_map_playlists_version_id").on(table.presetVersionId)]);

export const mapPlaylistMaps = sqliteTable("map_playlist_maps", {
  mapPlaylistId: text("map_playlist_id").notNull().references(() => mapPlaylists.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  mapName: text("map_name").notNull().references(() => gameMaps.name, { onDelete: "restrict" }),
}, (table) => [
  primaryKey({ columns: [table.mapPlaylistId, table.position] }),
  index("idx_map_playlist_maps_name").on(table.mapName),
]);

export const weaponConfigurations = sqliteTable("weapon_configurations", {
  id: text("id").primaryKey(),
  presetVersionId: text("preset_version_id").notNull().references(() => presetVersions.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["randomized", "swapper"] }).notNull(),
  name: text("name").notNull(),
  encodedValue: text("encoded_value"),
}, (table) => [index("idx_weapon_configurations_version_id").on(table.presetVersionId)]);

export const randomizedWeapons = sqliteTable("randomized_weapons", {
  id: text("id").primaryKey(),
  weaponConfigurationId: text("weapon_configuration_id").notNull().references(() => weaponConfigurations.id, { onDelete: "cascade" }),
  weaponName: text("weapon_name").notNull().references(() => gameWeapons.name, { onDelete: "restrict" }),
  weight: integer("weight").notNull(),
}, (table) => [
  uniqueIndex("uq_randomized_weapons_config_name").on(table.weaponConfigurationId, table.weaponName),
  index("idx_randomized_weapons_config_id").on(table.weaponConfigurationId),
]);

export const presetEvents = sqliteTable("preset_events", {
  id: text("id").primaryKey(),
  presetId: text("preset_id").notNull().references(() => presets.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["view", "link_open", "copy"] }).notNull(),
  actorHash: text("actor_hash").notNull(),
  networkHash: text("network_hash"),
  isAuthenticated: integer("is_authenticated", { mode: "boolean" }).notNull().default(false),
  clientEventId: text("client_event_id"),
  dedupeBucket: text("dedupe_bucket").notNull(),
  isInvalidated: integer("is_invalidated", { mode: "boolean" }).notNull().default(false),
  invalidatedAt: integer("invalidated_at", { mode: "timestamp_ms" }),
  invalidatedReason: text("invalidated_reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [
  uniqueIndex("uq_preset_events_dedupe").on(table.presetId, table.kind, table.actorHash, table.dedupeBucket),
  uniqueIndex("uq_preset_events_client_event").on(table.presetId, table.clientEventId),
  index("idx_preset_events_ranking").on(table.presetId, table.kind, table.createdAt),
  index("idx_preset_events_network").on(table.presetId, table.kind, table.networkHash, table.createdAt),
]);

export const presetUniqueActors = sqliteTable("preset_unique_actors", {
  presetId: text("preset_id").notNull().references(() => presets.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["view", "link_open", "copy"] }).notNull(),
  actorHash: text("actor_hash").notNull(),
  isAuthenticated: integer("is_authenticated", { mode: "boolean" }).notNull(),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
  eventCount: integer("event_count").notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.presetId, table.kind, table.actorHash] }),
  index("idx_preset_unique_actors_counts").on(table.presetId, table.kind, table.isAuthenticated),
]);

export const presetAbuseSignals = sqliteTable("preset_abuse_signals", {
  id: text("id").primaryKey(),
  presetId: text("preset_id").notNull().references(() => presets.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["view", "link_open", "copy"] }).notNull(),
  reason: text("reason", { enum: ["duplicate", "network_limit"] }).notNull(),
  dayBucket: text("day_bucket").notNull(),
  actorHash: text("actor_hash").notNull().default(""),
  networkHash: text("network_hash").notNull().default(""),
  attemptCount: integer("attempt_count").notNull().default(1),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [
  uniqueIndex("uq_preset_abuse_signal_group").on(table.presetId, table.kind, table.reason, table.dayBucket, table.actorHash, table.networkHash),
  index("idx_preset_abuse_signals_admin").on(table.presetId, table.lastSeenAt),
]);

export const presetStatistics = sqliteTable("preset_statistics", {
  presetId: text("preset_id").primaryKey().references(() => presets.id, { onDelete: "cascade" }),
  viewsTotal: integer("views_total").notNull().default(0),
  viewsUniqueAnonymous: integer("views_unique_anonymous").notNull().default(0),
  viewsUniqueAuthenticated: integer("views_unique_authenticated").notNull().default(0),
  linkOpensTotal: integer("link_opens_total").notNull().default(0),
  linkOpensUniqueAnonymous: integer("link_opens_unique_anonymous").notNull().default(0),
  linkOpensUniqueAuthenticated: integer("link_opens_unique_authenticated").notNull().default(0),
  copiesTotal: integer("copies_total").notNull().default(0),
  copiesUniqueAnonymous: integer("copies_unique_anonymous").notNull().default(0),
  copiesUniqueAuthenticated: integer("copies_unique_authenticated").notNull().default(0),
  qualityScoreMilli: integer("quality_score_milli").notNull().default(0),
  engagementScoreMilli: integer("engagement_score_milli").notNull().default(0),
  abuseSignalCount: integer("abuse_signal_count").notNull().default(0),
  lastEngagementAt: integer("last_engagement_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (table) => [
  index("idx_preset_statistics_ranking").on(table.qualityScoreMilli, table.engagementScoreMilli),
]);
