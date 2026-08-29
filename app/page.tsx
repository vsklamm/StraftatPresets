"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { AuthControl } from "@/app/auth-control";
import { WeaponMix } from "@/app/weapon-mix";
import { StraftatText } from "./straftat-text";
import { PresetContentEditor, starterPresetContent, type PresetContentUpdate } from "@/app/preset-editor";
import { MAX_VISIBLE_PRESET_TAGS } from "@/src/domain/tag-policy";
import { getPresetLimitMessage, MAX_PRESETS_PER_AUTHOR } from "@/src/domain/preset-policy";
import { catalogWeapons, getWeaponImage, supportedGameRelease, supportedMapCount, supportedWeaponCount, weaponAssetUrl } from "@/src/domain/game-weapons";
import { tagCatalogEntries } from "@/src/domain/tag-catalog";
import { RadialWeaponPicker, SearchTagPicker } from "@/app/search-tools";
import { calculateWeaponChances, formatWeaponPercent, type WeightedWeapon } from "@/src/domain/weapon-weights";
import { recordPresetCopy, recordPresetInteraction, retryPendingPresetCopies } from "@/src/lib/preset-interactions-client";
import type { PresetDashboardItem, PresetDashboardView } from "@/src/application/ports";
import type { ActiveTag } from "@/src/application/ports";
import { formatPresetIssueMessage } from "@/src/application/preset-issue-message";
import {
  countTextLines,
  formatCardDescriptionPreview,
  hasConsecutiveEmptyLines,
  MAX_PRESET_DESCRIPTION_CHARACTERS,
  MAX_PRESET_DESCRIPTION_LINES,
  MAX_PRESET_TITLE_CHARACTERS,
  normalizePresetContent,
  type PresetRevisionContent,
} from "@/src/domain/preset-content";
import { formatPresetVersionLabel, sortPresetVersionsNewestFirst } from "@/src/domain/preset-version";
import type { PresetIssue, UserPresetState } from "@/src/domain/preset-workflow";
import { MAX_THUMBNAIL_UPLOAD_BYTES } from "@/src/domain/thumbnail-policy";
import { optimizeThumbnailForUpload } from "@/src/lib/client-image-optimization";
import { SerializedTaskQueue } from "@/src/lib/serialized-task-queue";
import { PendingTaskTracker } from "@/src/lib/pending-task-tracker";
import { stripColorAndFormattingTags } from "@/src/domain/straftat-markup";
import { presetUrlIdentifier, type MapPlaylist, type Preset, type PresetVersion, type SortDirection, type WeaponSortKey } from "@/src/application/preset-view";
import type { UserProfile } from "@/src/domain/user-profile";

type SaveStatus = "idle" | "saving" | "saved" | "error";
import {
  localDraftKey,
  isUnmodifiedStarterDraft,
  parseLocalDraftSnapshot,
  reconcileLocalDraftWithRemote,
  serializeLocalDraftSnapshot,
  shouldQueueDraftSave,
} from "@/src/domain/preset-local-draft";

type AuthPrompt = { action: "submit" };
type PresetRevisionToken = { revisionId: string; editVersion: number };
type QueuedPresetSave = { signature: string; promise: Promise<PresetDashboardItem | undefined> };

function rememberPresetRevision(
  tokens: Map<string, PresetRevisionToken>,
  preset: Pick<Preset, "id" | "revisionId" | "editVersion"> | Pick<PresetDashboardItem, "id" | "revisionId" | "editVersion">,
) {
  if (!preset.revisionId || preset.editVersion === undefined) return;
  const current = tokens.get(preset.id);
  if (!current || current.revisionId !== preset.revisionId || preset.editVersion >= current.editVersion) {
    tokens.set(preset.id, { revisionId: preset.revisionId, editVersion: preset.editVersion });
  }
}

function readLocalDraft(item: PresetDashboardItem): PresetRevisionContent | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(localDraftKey(item.id));
  const snapshot = parseLocalDraftSnapshot(raw);
  const reconciliation = reconcileLocalDraftWithRemote(item, snapshot);
  if (reconciliation.shouldClearLocal) {
    window.localStorage.removeItem(localDraftKey(item.id));
  }
  return reconciliation.isLocalNewer ? reconciliation.effectiveContent : null;
}

function writeLocalDraft(preset: Preset, content: PresetRevisionContent) {
  if (!preset.revisionId || preset.editVersion === undefined || typeof window === "undefined") return;
  try {
    const serialized = serializeLocalDraftSnapshot({
      revisionId: preset.revisionId,
      editVersion: preset.editVersion,
      content,
    });
    window.localStorage.setItem(localDraftKey(preset.id), serialized);
  } catch {
    // Local storage quota or disabled
  }
}

function clearLocalDraft(presetId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(localDraftKey(presetId));
}

function clearMatchingLocalDraft(presetId: string, signature: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(localDraftKey(presetId));
    const snapshot = parseLocalDraftSnapshot(raw);
    if (snapshot && JSON.stringify(snapshot.content) === signature) {
      clearLocalDraft(presetId);
    }
  } catch {
    clearLocalDraft(presetId);
  }
}

async function readPresetAfterAmbiguousSave(presetId: string): Promise<PresetDashboardItem | undefined> {
  try {
    const response = await fetch(`/api/presets/${encodeURIComponent(presetId)}`, {
      credentials: "same-origin",
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const result = await response.json() as { preset?: PresetDashboardItem };
    return result.preset;
  } catch {
    return undefined;
  }
}

function mediaUrl(key: string) {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function labelFromSlug(slug: string, tagLabels: ReadonlyMap<string, string>) {
  return tagLabels.get(slug) ?? slug.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

function dashboardItemToPreset(item: PresetDashboardItem, tagLabels: ReadonlyMap<string, string>): Preset {
  const content = normalizePresetContent(item.content);
  const versions: PresetVersion[] = content.versions.map((version) => {
    const copyTargets = item.copyManifest?.versions.find((targets) => targets.label === version.label);
    return {
      label: version.label,
      released: item.state === "pending" ? "Waiting for review" : item.state === "draft" ? "Draft" : "Published",
      maps: version.mapPlaylists.map((playlist, playlistIndex) => ({
        name: playlist.name,
        mapCount: playlist.mapNames.length,
        description: playlist.description,
        code: playlist.encodedValue,
        copyKey: copyTargets?.mapPlaylists[playlistIndex] ?? undefined,
      })),
      randomizedWeapons: version.weaponConfigurations.find((configuration) => configuration.kind === "randomized")?.weapons,
      randomizedWeaponsCopyKey: copyTargets?.randomizedWeapons ?? undefined,
      swapper: version.weaponConfigurations.filter((configuration) => configuration.kind === "swapper").map((configuration, swapperIndex) => ({
        name: configuration.name,
        description: "",
        code: configuration.encodedValue,
        copyKey: copyTargets?.swappers[swapperIndex] ?? undefined,
      })),
    };
  });
  return {
    id: item.id,
    slug: item.slug,
    title: content.title,
    author: item.authorName,
    image: content.thumbnailKey ? mediaUrl(content.thumbnailKey) : undefined,
    description: content.description,
    tags: content.tags.map((tag) => labelFromSlug(tag, tagLabels)),
    copies: item.copies,
    versioningEnabled: content.versioningEnabled,
    versions: versions.length ? versions : [{ label: "-", released: "Draft" }],
    persisted: true,
    state: item.state,
    workingStatus: item.workingStatus,
    canEdit: item.canEdit,
    revisionId: item.revisionId,
    editVersion: item.editVersion,
    hasPublishedRevision: item.hasPublishedRevision,
    issues: item.issues,
    content,
    copyPublicationId: item.copyManifest?.publicationId,
  };
}

function latestVersion(preset: Preset) { return sortPresetVersionsNewestFirst(preset.versions)[0]; }
function configLabels(version: PresetVersion) {
  return [
    version.maps?.length ? `${version.maps.length} Map playlist${version.maps.length === 1 ? "" : "s"}` : null,
    version.randomizedWeapons ? "Randomized weapons" : null,
    version.swapper?.length ? `${version.swapper.length} Swapper setting${version.swapper.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean) as string[];
}

export default function Home() {
  const { data: authSession, status: authStatus } = useSession();
  const [accountProfile, setAccountProfile] = useState<{ userId: string; profile: UserProfile } | null>(null);
  const [isProfileEditorRequested, setIsProfileEditorRequested] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedSearchTags, setSelectedSearchTags] = useState<Array<{ slug: string; label: string }>>([]);
  const [selectedSearchWeapons, setSelectedSearchWeapons] = useState<Array<{ gameId: string; name: string }>>([]);
  const [searchTagPickerOpen, setSearchTagPickerOpen] = useState(false);
  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false);
  const weaponPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const [dashboardView, setDashboardView] = useState<PresetDashboardView>("popular");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      void Promise.resolve().then(() => {
        setIsMounted(true);
        if (window.sessionStorage.getItem("justLoggedIn") === "true") {
          window.sessionStorage.removeItem("justLoggedIn");
          window.sessionStorage.setItem("dashboardView", "mine");
          setDashboardView("mine");
        } else {
          const stored = window.sessionStorage.getItem("dashboardView");
          if (stored === "popular" || stored === "newest" || stored === "updated" || stored === "mine") {
            setDashboardView(stored === "newest" ? "updated" : stored);
          }
        }
      });
    }
  }, []);
  const [itemsByView, setItemsByView] = useState<Partial<Record<PresetDashboardView, PresetDashboardItem[]>>>({});
  const updateDashboardItems = useCallback((updater: (current: PresetDashboardItem[]) => PresetDashboardItem[]) => {
    setItemsByView((prev) => {
      const next: Partial<Record<PresetDashboardView, PresetDashboardItem[]>> = {};
      for (const [viewKey, items] of Object.entries(prev) as [PresetDashboardView, PresetDashboardItem[]][]) {
        if (items) next[viewKey] = updater(items);
      }
      return next;
    });
  }, []);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [searchItems, setSearchItems] = useState<PresetDashboardItem[] | undefined>();
  const [searchResultKey, setSearchResultKey] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [tagCatalog, setTagCatalog] = useState<ActiveTag[]>([]);
  const [selected, setSelected] = useState<Preset | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<PresetRevisionContent | null>(null);
  const [editorVersionIndex, setEditorVersionIndex] = useState(0);
  const [thumbnailStatus, setThumbnailStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [thumbnailError, setThumbnailError] = useState("");
  const [failedThumbnailIds, setFailedThumbnailIds] = useState<Set<string>>(new Set());
  const handleThumbnailError = (presetId: string) => {
    setFailedThumbnailIds((prev) => (prev.has(presetId) ? prev : new Set(prev).add(presetId)));
  };
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showSubmissionIssues, setShowSubmissionIssues] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyCounts, setCopyCounts] = useState<Record<string, number>>({});
  const [weaponSort, setWeaponSort] = useState<WeaponSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [weaponCopyBurst, setWeaponCopyBurst] = useState(0);
  const [isDialogScrolling, setIsDialogScrolling] = useState(false);
  const weaponCopyButtonRef = useRef<HTMLButtonElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const dialogScrollTimer = useRef<number | null>(null);
  const savedContentRef = useRef("");
  const draftContentRef = useRef<PresetRevisionContent | null>(null);
  const serverContentByPresetRef = useRef(new Map<string, string>());
  const presetRevisionTokensRef = useRef(new Map<string, PresetRevisionToken>());
  const saveQueueRef = useRef(new SerializedTaskQueue());
  const queuedSaveCountsRef = useRef(new Map<string, number>());
  const latestQueuedSaveRef = useRef(new Map<string, QueuedPresetSave>());
  const pendingEditorChangesRef = useRef(new PendingTaskTracker());
  const linkedInteractionRef = useRef("");
  const openPresetIdRef = useRef("");
  const dialogSectionRef = useRef<HTMLElement>(null);

  const handleProfileChange = useCallback((profile: UserProfile) => {
    const userId = authSession?.user.id;
    if (!userId) return;
    setAccountProfile({ userId, profile });
    updateDashboardItems((current) => current.map((item) => item.authorId === userId ? { ...item, authorName: profile.displayName } : item));
    setSearchItems((current) => current?.map((item) => item.authorId === userId ? { ...item, authorName: profile.displayName } : item));
    setSelected((current) => current?.canEdit ? { ...current, author: profile.displayName } : current);
  }, [authSession?.user.id, updateDashboardItems]);

  useEffect(() => {
    void Promise.allSettled(catalogWeapons.map((weapon) => fetch(weaponAssetUrl(weapon.image), { cache: "force-cache" })));
  }, []);

  useEffect(() => {
    void retryPendingPresetCopies((presetId, result) => {
      const total = result.statistics?.copies.total;
      if (total !== undefined) setCopyCounts((current) => ({ ...current, [presetId]: total }));
    });
  }, []);

  useEffect(() => {
    if (!actionError) return;
    const timer = window.setTimeout(() => setActionError(""), 7000);
    return () => window.clearTimeout(timer);
  }, [actionError]);

  useEffect(() => {
    draftContentRef.current = draftContent;
  }, [draftContent]);

  useEffect(() => {
    let active = true;
    void fetch("/api/tags", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ tags: ActiveTag[] }> : Promise.reject())
      .then((result) => { if (active) setTagCatalog(result.tags); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const activeDashboardView: PresetDashboardView = (authStatus === "unauthenticated" && dashboardView === "mine") || !isMounted ? "popular" : dashboardView;
  const selectedSearchLabels = useMemo(() => new Set([
    ...selectedSearchTags.map((tag) => tag.label.toLocaleLowerCase("en-US")),
    ...selectedSearchWeapons.map((weapon) => weapon.name.toLocaleLowerCase("en-US")),
  ]), [selectedSearchTags, selectedSearchWeapons]);
  const freeSearchQuery = useMemo(() => query.split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !selectedSearchLabels.has(segment.toLocaleLowerCase("en-US")))
    .join(", "), [query, selectedSearchLabels]);
  const searchActive = Boolean(query.trim() || selectedSearchTags.length || selectedSearchWeapons.length);
  const currentSearchKey = JSON.stringify([
    activeDashboardView,
    freeSearchQuery,
    selectedSearchTags.map((tag) => tag.slug),
    selectedSearchWeapons.map((weapon) => weapon.gameId),
  ]);

  useEffect(() => {
    if (authStatus === "loading" || (activeDashboardView === "mine" && authStatus !== "authenticated")) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) { setDashboardLoading(true); setDashboardError(""); } });
    void fetch(`/api/presets?view=${activeDashboardView}&limit=48`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Presets could not be loaded.");
        return response.json() as Promise<{ items: PresetDashboardItem[] }>;
      })
      .then((result) => {
        const recovered = result.items.map((item) => {
          serverContentByPresetRef.current.set(item.id, JSON.stringify(item.content));
          const localContent = readLocalDraft(item);
          return localContent ? { ...item, content: localContent } : item;
        });
        setItemsByView((prev) => ({ ...prev, [activeDashboardView]: recovered }));
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setDashboardError(error instanceof Error ? error.message : "Presets could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setDashboardLoading(false); });
    return () => controller.abort();
  }, [activeDashboardView, authStatus]);

  useEffect(() => {
    if (!searchActive || authStatus === "loading" || (activeDashboardView === "mine" && authStatus !== "authenticated")) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError("");
      const params = new URLSearchParams({ view: activeDashboardView === "mine" ? "mine" : activeDashboardView === "updated" ? "updated" : "popular", limit: "48" });
      if (freeSearchQuery) params.set("q", freeSearchQuery);
      if (selectedSearchTags.length) params.set("tags", selectedSearchTags.map((tag) => tag.slug).join(","));
      if (selectedSearchWeapons.length) params.set("weapons", selectedSearchWeapons.map((weapon) => weapon.gameId).join(","));
      void fetch(`/api/presets/search?${params}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Presets could not be searched.");
          return response.json() as Promise<{ items: PresetDashboardItem[] }>;
        })
        .then((result) => { if (!controller.signal.aborted) { setSearchItems(result.items); setSearchResultKey(currentSearchKey); } })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setSearchItems([]);
            setSearchResultKey(currentSearchKey);
            setSearchError(error instanceof Error ? error.message : "Presets could not be searched.");
          }
        })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false); });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeDashboardView, authStatus, currentSearchKey, freeSearchQuery, searchActive, selectedSearchTags, selectedSearchWeapons]);

  const tagLabels = useMemo(() => new Map(tagCatalog.map((tag) => [tag.slug, tag.label])), [tagCatalog]);
  const dashboardItems = itemsByView[activeDashboardView];
  const effectiveDashboardItems = searchActive ? (searchResultKey === currentSearchKey ? searchItems : undefined) : dashboardItems;
  const isViewLoaded = effectiveDashboardItems !== undefined;
  const storedPresets = useMemo(() => (effectiveDashboardItems ?? []).map((item) => dashboardItemToPreset(item, tagLabels)), [effectiveDashboardItems, tagLabels]);
  const dashboardPresets = storedPresets;
  const visiblePresets = dashboardPresets;

  const selectedVersion = selected?.versions.find((version) => version.label === versionLabel) ?? (selected ? latestVersion(selected) : null);
  const weightedWeapons = useMemo(() => calculateWeaponChances(selectedVersion?.randomizedWeapons ?? []), [selectedVersion]);
  const sortedWeapons = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...weightedWeapons].sort((a, b) => {
      if (weaponSort === "name") return a.name.localeCompare(b.name) * direction;
      return (a[weaponSort] - b[weaponSort]) * direction;
    });
  }, [weightedWeapons, weaponSort, sortDirection]);

  const [isRevalidating, setIsRevalidating] = useState(false);
  const [revalidationFailedId, setRevalidationFailedId] = useState<string | null>(null);
  const revalidateTimerRef = useRef<number | null>(null);

  const revalidatePreset = useCallback(async (presetId: string) => {
    if (revalidateTimerRef.current !== null) {
      window.clearTimeout(revalidateTimerRef.current);
    }
    setIsRevalidating(true);
    setRevalidationFailedId(null);

    let completed = false;
    revalidateTimerRef.current = window.setTimeout(() => {
      if (!completed) {
        setIsRevalidating(false);
        setRevalidationFailedId(presetId);
      }
    }, 6000);

    try {
      const response = await fetch(`/api/presets/${encodeURIComponent(presetId)}`, {
        credentials: "same-origin",
        headers: { "Accept": "application/json" },
      });
      completed = true;
      if (revalidateTimerRef.current !== null) {
        window.clearTimeout(revalidateTimerRef.current);
        revalidateTimerRef.current = null;
      }
      setIsRevalidating(false);

      if (!response.ok) {
        setRevalidationFailedId(presetId);
        return;
      }

      const data = (await response.json()) as { preset?: PresetDashboardItem };
      if (!data.preset) {
        setRevalidationFailedId(presetId);
        return;
      }

      const localContent = readLocalDraft(data.preset);
      rememberPresetRevision(presetRevisionTokensRef.current, data.preset);
      const effectiveItem = localContent ? { ...data.preset, content: localContent } : data.preset;
      const updated = dashboardItemToPreset(effectiveItem, tagLabels);
      const savedSignature = JSON.stringify(data.preset.content);
      serverContentByPresetRef.current.set(data.preset.id, savedSignature);
      updateDashboardItems((current) => {
        const exists = current.some((item) => item.id === data.preset!.id);
        return exists ? current.map((item) => item.id === data.preset!.id ? effectiveItem : item) : [effectiveItem, ...current];
      });

      if (openPresetIdRef.current === presetId) {
        setSelected((current) => {
          if (!current || current.id !== presetId) return current;
          return updated;
        });
        if (localContent) {
          setDraftContent(localContent);
        }
        setRevalidationFailedId(null);
      }
    } catch {
      completed = true;
      if (revalidateTimerRef.current !== null) {
        window.clearTimeout(revalidateTimerRef.current);
        revalidateTimerRef.current = null;
      }
      setIsRevalidating(false);
      setRevalidationFailedId(presetId);
    }
  }, [tagLabels, updateDashboardItems]);

  const selectPreset = (preset: Preset, edit = false) => {
    rememberPresetRevision(presetRevisionTokensRef.current, preset);
    openPresetIdRef.current = preset.id;
    setSelected(preset);
    setVersionLabel(latestVersion(preset).label);
    setCopied(null);
    setWeaponSort("name");
    setSortDirection("asc");
    setWeaponCopyBurst(0);
    setIsEditing(edit && Boolean(preset.canEdit));
    setDraftContent(preset.content ?? null);
    setEditorVersionIndex(0);
    setThumbnailStatus("idle");
    setThumbnailError("");
    savedContentRef.current = serverContentByPresetRef.current.get(preset.id) ?? (preset.content ? JSON.stringify(preset.content) : "");
    setSaveStatus("idle");
    setShowSubmissionIssues(false);
    setTagPickerOpen(false);
    setTagQuery("");
  };
  const openPreset = (preset: Preset) => {
    selectPreset(preset);
    const url = new URL(window.location.href);
    const identifier = presetUrlIdentifier(preset);
    url.searchParams.set("p", identifier);
    window.history.pushState(null, "", url);
    if (preset.persisted) {
      void recordPresetInteraction(preset.id, "view").catch(() => undefined);
      void revalidatePreset(preset.id);
    }
  };
  const persistDraft = useCallback((preset: Preset, content: PresetRevisionContent, signature: string) => {
    if (!preset.revisionId || preset.editVersion === undefined) return Promise.resolve<PresetDashboardItem | undefined>(undefined);
    const queued = latestQueuedSaveRef.current.get(preset.id);
    if (queued?.signature === signature) return queued.promise;
    queuedSaveCountsRef.current.set(preset.id, (queuedSaveCountsRef.current.get(preset.id) ?? 0) + 1);
    if (openPresetIdRef.current === preset.id) setSaveStatus("saving");

    const operation = saveQueueRef.current.enqueue(preset.id, async () => {
      const token = presetRevisionTokensRef.current.get(preset.id) ?? {
        revisionId: preset.revisionId!,
        editVersion: preset.editVersion!,
      };
      let savedPreset: PresetDashboardItem;
      try {
        const response = await fetch(`/api/presets/${encodeURIComponent(preset.id)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...token, content }),
          keepalive: true,
        });
        const result = await response.json() as { preset?: PresetDashboardItem; error?: string };
        if (!response.ok || !result.preset) throw new Error(result.error ?? "Autosave failed.");
        savedPreset = result.preset;
      } catch (error) {
        const currentPreset = await readPresetAfterAmbiguousSave(preset.id);
        if (!currentPreset || JSON.stringify(currentPreset.content) !== signature) throw error;
        savedPreset = currentPreset;
      }

      rememberPresetRevision(presetRevisionTokensRef.current, savedPreset);
      const updated = dashboardItemToPreset(savedPreset, tagLabels);
      const savedSignature = JSON.stringify(savedPreset.content);
      serverContentByPresetRef.current.set(savedPreset.id, savedSignature);
      if (openPresetIdRef.current === savedPreset.id) {
        const url = new URL(window.location.href);
        const identifier = presetUrlIdentifier(updated);
        if (url.searchParams.get("p") !== identifier) {
          url.searchParams.set("p", identifier);
          window.history.replaceState(null, "", url);
        }
      }
      updateDashboardItems((current) => {
        const exists = current.some((item) => item.id === savedPreset.id);
        return exists ? current.map((item) => item.id === savedPreset.id ? savedPreset : item) : [savedPreset, ...current];
      });
      clearMatchingLocalDraft(savedPreset.id, signature);
      if (openPresetIdRef.current === preset.id) {
        savedContentRef.current = savedSignature;
        if (JSON.stringify(draftContentRef.current) === signature) {
          draftContentRef.current = savedPreset.content;
        }
        setSelected((current) => current?.id === preset.id ? updated : current);
        setDraftContent((current) => JSON.stringify(current) === signature ? savedPreset.content : current);
        setVersionLabel(latestVersion(updated).label);
      }
      return savedPreset;
    });

    const completion = operation.then((result) => {
      const remaining = (queuedSaveCountsRef.current.get(preset.id) ?? 1) - 1;
      if (remaining > 0) queuedSaveCountsRef.current.set(preset.id, remaining);
      else queuedSaveCountsRef.current.delete(preset.id);
      if (remaining === 0 && openPresetIdRef.current === preset.id) {
        setSaveStatus(JSON.stringify(draftContentRef.current) === savedContentRef.current ? "saved" : "idle");
      }
      return result;
    }, (error) => {
      const remaining = (queuedSaveCountsRef.current.get(preset.id) ?? 1) - 1;
      if (remaining > 0) queuedSaveCountsRef.current.set(preset.id, remaining);
      else queuedSaveCountsRef.current.delete(preset.id);
      console.error("Remote autosave failed:", error);
      if (remaining === 0 && openPresetIdRef.current === preset.id) setSaveStatus("error");
      throw error;
    });
    latestQueuedSaveRef.current.set(preset.id, { signature, promise: completion });
    const clearQueuedSave = () => {
      if (latestQueuedSaveRef.current.get(preset.id)?.promise === completion) latestQueuedSaveRef.current.delete(preset.id);
    };
    void completion.then(clearQueuedSave, clearQueuedSave);
    return completion;
  }, [tagLabels, updateDashboardItems]);

  const trackPendingEditorChange = useCallback((task: Promise<void>) => {
    pendingEditorChangesRef.current.track(task);
  }, []);

  const waitForPendingEditorChanges = useCallback(async () => {
    await pendingEditorChangesRef.current.waitForIdle();
  }, []);

  const flushSelectedDraft = useCallback(async () => {
    if (!selected?.persisted || !selected.canEdit || !selected.revisionId || selected.editVersion === undefined) return true;
    await waitForPendingEditorChanges();
    const content = draftContentRef.current ?? draftContent;
    if (!content) return true;
    const signature = JSON.stringify(content);
    if (!shouldQueueDraftSave(signature, savedContentRef.current, saveQueueRef.current.hasPending(selected.id))) return true;
    try {
      await persistDraft(selected, content, signature);
      return true;
    } catch {
      return false;
    }
  }, [selected, draftContent, persistDraft, waitForPendingEditorChanges]);

  const enterEditMode = useCallback(() => {
    if (!selected?.canEdit) return;
    setIsEditing(true);
    if (!draftContent) {
      setDraftContent(selected.content ?? null);
    }
  }, [selected, draftContent]);

  const dismissPreset = useCallback(() => {
    if (revalidateTimerRef.current !== null) {
      window.clearTimeout(revalidateTimerRef.current);
      revalidateTimerRef.current = null;
    }
    setIsRevalidating(false);
    setRevalidationFailedId(null);
    openPresetIdRef.current = "";
    draftContentRef.current = null;
    setSelected(null);
    setIsEditing(false);
    setDraftContent(null);
    setShowSubmissionIssues(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("p");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const discardUnmodifiedDraft = useCallback(async (preset: Preset) => {
    try {
      const response = await fetch(`/api/presets/${encodeURIComponent(preset.id)}`, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok && response.status !== 404) throw new Error("The empty draft could not be discarded.");
      clearLocalDraft(preset.id);
      updateDashboardItems((current) => current.filter((item) => item.id !== preset.id));
      return true;
    } catch {
      setActionError("Could not discard the empty draft. Please try again.");
      return false;
    }
  }, [updateDashboardItems]);

  const exitEditMode = useCallback(async () => {
    const content = draftContentRef.current ?? draftContent;
    if (selected?.persisted && selected.canEdit && selected.state === "draft" && content &&
      isUnmodifiedStarterDraft(content, serverContentByPresetRef.current.get(selected.id))) {
      if (await discardUnmodifiedDraft(selected)) dismissPreset();
      return;
    }
    if (await flushSelectedDraft()) {
      setIsEditing(false);
    } else {
      setActionError("Changes are safe on this device, but could not be synced. Try again.");
    }
  }, [selected, draftContent, discardUnmodifiedDraft, dismissPreset, flushSelectedDraft]);

  const closePreset = useCallback(async () => {
    if (isSubmitting) return;
    const content = draftContentRef.current ?? draftContent;
    if (isEditing && selected?.persisted && selected.canEdit && content) {
      if (selected.state === "draft" && isUnmodifiedStarterDraft(content, serverContentByPresetRef.current.get(selected.id))) {
        if (!await discardUnmodifiedDraft(selected)) return;
      } else {
        if (!await flushSelectedDraft()) {
          setActionError("Changes are safe on this device, but could not be synced. Try closing again.");
          return;
        }
      }
    }
    dismissPreset();
  }, [isEditing, isSubmitting, selected, draftContent, discardUnmodifiedDraft, flushSelectedDraft, dismissPreset]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "s" || event.code === "KeyS")) {
        if (selected) {
          event.preventDefault();
          const active = document.activeElement;
          const isInputFocused =
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement ||
            active instanceof HTMLSelectElement ||
            Boolean((active as HTMLElement)?.isContentEditable);

          if (isInputFocused) {
            (active as HTMLElement).blur();
            dialogSectionRef.current?.focus();
          }
        }
        return;
      }

      if (event.key === "Escape") {
        if (authPrompt) {
          setAuthPrompt(null);
          return;
        }

        if (selected) {
          const active = document.activeElement;
          const isInputFocused =
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement ||
            active instanceof HTMLSelectElement ||
            Boolean((active as HTMLElement)?.isContentEditable);

          if (isInputFocused) {
            (active as HTMLElement).blur();
            if (tagPickerOpen) setTagPickerOpen(false);
            return;
          }

          if (tagPickerOpen) {
            setTagPickerOpen(false);
            return;
          }

          if (isEditing) {
            void exitEditMode();
            return;
          }

          void closePreset();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, isEditing, tagPickerOpen, authPrompt, exitEditMode, closePreset]);

  useEffect(() => {
    let isCancelled = false;
    const openLinkedPreset = async () => {
      const url = new URL(window.location.href);
      const identifier = url.searchParams.get("p");
      if (!identifier) return;

      let linked = dashboardPresets.find((preset) => (preset.slug && preset.slug === identifier) || preset.id === identifier);

      if (linked) {
        if (openPresetIdRef.current === linked.id) return;
        openPresetIdRef.current = linked.id;
        setSelected(linked);
        setVersionLabel(latestVersion(linked).label);
        setDraftContent(linked.content ?? null);
        setEditorVersionIndex(0);
        savedContentRef.current = serverContentByPresetRef.current.get(linked.id) ?? (linked.content ? JSON.stringify(linked.content) : "");
        setCopied(null);
        setWeaponSort("name");
        setSortDirection("asc");
        setWeaponCopyBurst(0);
        if (linked.persisted && linkedInteractionRef.current !== linked.id) {
          linkedInteractionRef.current = linked.id;
          void recordPresetInteraction(linked.id, "link_open").catch(() => undefined);
        }
        void revalidatePreset(linked.id);
      } else {
        if (openPresetIdRef.current === identifier) return;
        openPresetIdRef.current = identifier;
        try {
          const response = await fetch(`/api/presets/${encodeURIComponent(identifier)}`, {
            credentials: "same-origin",
            headers: { "Accept": "application/json" },
          });
          if (response.ok) {
            const data = (await response.json()) as { preset?: PresetDashboardItem };
            if (data.preset && !isCancelled) {
              const localContent = readLocalDraft(data.preset);
              const effectiveItem = localContent ? { ...data.preset, content: localContent } : data.preset;
              linked = dashboardItemToPreset(effectiveItem, tagLabels);
              openPresetIdRef.current = linked.id;
              updateDashboardItems((current) => {
                const exists = current.some((item) => item.id === data.preset!.id);
                return exists ? current.map((item) => item.id === data.preset!.id ? effectiveItem : item) : [effectiveItem, ...current];
              });
              setSelected(linked);
              setVersionLabel(latestVersion(linked).label);
              setDraftContent(linked.content ?? null);
              setEditorVersionIndex(0);
              savedContentRef.current = serverContentByPresetRef.current.get(linked.id) ?? (linked.content ? JSON.stringify(linked.content) : "");
              setCopied(null);
              setWeaponSort("name");
              setSortDirection("asc");
              setWeaponCopyBurst(0);
              if (linked.persisted && linkedInteractionRef.current !== linked.id) {
                linkedInteractionRef.current = linked.id;
                void recordPresetInteraction(linked.id, "link_open").catch(() => undefined);
              }
            }
          } else if (response.status === 404 && !isCancelled) {
            openPresetIdRef.current = "";
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("p");
            window.history.replaceState(null, "", cleanUrl);
            setActionError("This preset does not exist or has been removed.");
          } else {
            openPresetIdRef.current = "";
          }
        } catch {
          openPresetIdRef.current = "";
          if (!isCancelled && typeof window !== "undefined") {
            try {
              const raw = window.localStorage.getItem(localDraftKey(identifier));
              const snapshot = parseLocalDraftSnapshot(raw);
              if (snapshot) {
                const localContent = snapshot.content;
                const fallbackItem: PresetDashboardItem = {
                  id: identifier,
                  slug: identifier,
                  authorId: authSession?.user.id ?? "local",
                  authorName: accountProfile?.profile.displayName ?? authSession?.user.name ?? "Local Draft",
                  workingStatus: "draft",
                  hasPublishedRevision: false,
                  canEdit: true,
                  revisionId: snapshot.revisionId || "local",
                  revisionNumber: 1,
                  editVersion: snapshot.editVersion ?? 0,
                  content: localContent,
                  copyManifest: null,
                  issues: [],
                  copies: 0,
                  updatedAt: new Date(snapshot.updatedAt || Date.now()),
                  publishedAt: null,
                };
                linked = dashboardItemToPreset(fallbackItem, tagLabels);
                openPresetIdRef.current = linked.id;
                setSelected(linked);
                setVersionLabel(latestVersion(linked).label);
                setDraftContent(localContent);
                setEditorVersionIndex(0);
                setIsEditing(true);
              }
            } catch {
              // Local storage fallback failed
            }
          }
        }
      }
    };
    void openLinkedPreset();
    window.addEventListener("popstate", openLinkedPreset);
    return () => {
      isCancelled = true;
      window.removeEventListener("popstate", openLinkedPreset);
    };
  }, [accountProfile, authSession?.user.id, authSession?.user.name, dashboardPresets, tagLabels, revalidatePreset, updateDashboardItems]);

  // Ensure local draft is always updated in localStorage synchronously on change
  useEffect(() => {
    if (!isEditing || !selected?.persisted || !selected.canEdit || !draftContent) return;
    writeLocalDraft(selected, draftContent);
  }, [draftContent, isEditing, selected]);

  // Periodic remote autosave (every 1 minute if there are local unsaved changes)
  useEffect(() => {
    if (!isEditing || !selected?.persisted || !selected.canEdit || !selected.revisionId || selected.editVersion === undefined || !draftContent) return;
    const interval = window.setInterval(() => {
      const signature = JSON.stringify(draftContent);
      if (signature !== savedContentRef.current) {
        void persistDraft(selected, draftContent, signature).catch(() => {
          if (openPresetIdRef.current === selected.id) setSaveStatus("error");
        });
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [draftContent, isEditing, persistDraft, selected]);

  const updateDraftContent = (update: PresetContentUpdate) => {
    const currentContent = draftContentRef.current;
    const content = typeof update === "function"
      ? (currentContent ? update(currentContent) : null)
      : update;
    if (!content || content === currentContent) return;
    draftContentRef.current = content;
    setDraftContent(content);
    if (selected?.workingStatus === "rejected") {
      setSelected((current) => current?.id === selected.id ? {
        ...current,
        workingStatus: "draft",
        issues: current.issues?.filter((issue) => issue.source !== "moderation"),
      } : current);
      setShowSubmissionIssues(false);
    }
    if (selected?.persisted && selected.canEdit) {
      writeLocalDraft(selected, content);
      const signature = JSON.stringify(content);
      if (signature === savedContentRef.current) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("idle");
      }
    }
  };
  const changeWeaponSort = (key: WeaponSortKey) => { if (weaponSort === key) setSortDirection((current) => current === "asc" ? "desc" : "asc"); else { setWeaponSort(key); setSortDirection("asc"); } };
  const sortState = (key: WeaponSortKey): "ascending" | "descending" | "none" => key === weaponSort ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
  const sortArrow = (key: WeaponSortKey) => key === weaponSort ? (sortDirection === "asc" ? "↑" : "↓") : "↕";
  const copyCount = (preset: Preset) => copyCounts[preset.id] ?? preset.copies;
  const recordSelectedCopy = (preset: Preset, targetKey: string) => {
    if (!preset.copyPublicationId) return;
    let accepted = false;
    void recordPresetCopy(preset.id, preset.copyPublicationId, targetKey, () => {
      accepted = true;
      setCopyCounts((current) => ({ ...current, [preset.id]: (current[preset.id] ?? preset.copies) + 1 }));
    }).then((result) => {
      const total = result?.statistics?.copies.total;
      if (total !== undefined) {
        setCopyCounts((current) => ({ ...current, [preset.id]: total }));
      } else if (result && !result.counted && accepted) {
        setCopyCounts((current) => ({ ...current, [preset.id]: Math.max(0, (current[preset.id] ?? preset.copies) - 1) }));
      }
    }).catch(() => undefined);
  };
  const copyText = async (key: string, text: string, targetKey?: string) => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1800);
    if (targetKey && selected?.persisted) recordSelectedCopy(selected, targetKey);
  };
  const copyWeapons = (weapons: WeightedWeapon[], targetKey?: string) => {
    setWeaponCopyBurst((burst) => burst + 1);
    void copyText("weapons", calculateWeaponChances(weapons).map((weapon) => `${weapon.name} - ${weapon.weight} (${formatWeaponPercent(weapon.percent)})`).join("\n"), targetKey).catch(() => undefined);
  };
  const handleDialogScroll = () => {
    setIsDialogScrolling(true);
    if (dialogScrollTimer.current !== null) window.clearTimeout(dialogScrollTimer.current);
    dialogScrollTimer.current = window.setTimeout(() => setIsDialogScrolling(false), 650);
  };
  const submitPreset = () => {
    if (authStatus !== "authenticated") {
      if (authStatus !== "loading") setAuthPrompt({ action: "submit" });
      return;
    }
    if (accountProfile?.userId !== authSession?.user.id || !accountProfile.profile.hasConfiguredDisplayName) {
      setIsProfileEditorRequested(true);
      return;
    }
    if (itemsByView.mine && itemsByView.mine.length >= MAX_PRESETS_PER_AUTHOR) {
      setActionError(getPresetLimitMessage());
      if (activeDashboardView !== "mine") {
        chooseDashboardView("mine");
      }
      return;
    }
    if (!isCreating) void createPreset();
  };
  const chooseDashboardView = (view: PresetDashboardView) => {
    if (typeof window !== "undefined") window.sessionStorage.setItem("dashboardView", view);
    setDashboardView(view);
  };
  const createPreset = async () => {
    setIsCreating(true);
    setActionError("");
    try {
      const response = await fetch("/api/presets", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Untitled" }) });
      const result = await response.json() as { preset?: PresetDashboardItem; error?: string; code?: string };
      if (!response.ok || !result.preset) {
        if (result.code === "preset_limit_reached" && activeDashboardView !== "mine") {
          chooseDashboardView("mine");
        }
        throw new Error(result.error ?? "The preset could not be created.");
      }
      serverContentByPresetRef.current.set(result.preset.id, JSON.stringify(result.preset.content));
      const created = dashboardItemToPreset(result.preset, tagLabels);
      setItemsByView((prev) => {
        const next: Partial<Record<PresetDashboardView, PresetDashboardItem[]>> = {};
        for (const [viewKey, items] of Object.entries(prev) as [PresetDashboardView, PresetDashboardItem[]][]) {
          if (items) next[viewKey] = [result.preset!, ...items.filter((item) => item.id !== result.preset!.id)];
        }
        if (!next.mine) next.mine = [result.preset!];
        return next;
      });
      if (typeof window !== "undefined") window.sessionStorage.setItem("dashboardView", "mine");
      setDashboardView("mine");
      selectPreset(created, true);
      setDraftContent(starterPresetContent(result.preset.content));
      const url = new URL(window.location.href);
      const identifier = presetUrlIdentifier(created);
      url.searchParams.set("p", identifier);
      window.history.pushState(null, "", url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The preset could not be created.");
    } finally {
      setIsCreating(false);
    }
  };
  useEffect(() => {
    if (authStatus !== "authenticated" || isCreating || accountProfile?.userId !== authSession?.user.id || !accountProfile.profile.hasConfiguredDisplayName) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("create") !== "1") return;
    url.searchParams.delete("create");
    window.history.replaceState(null, "", url);
    window.queueMicrotask(() => void createPreset());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, authSession?.user.id, isCreating, accountProfile]);

  const submitSelectedPreset = async () => {
    if (!selected?.revisionId || selected.editVersion === undefined || isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (!await flushSelectedDraft()) {
        setActionError("Changes are safe on this device, but could not be synced. Try Submit again.");
        return;
      }
      const token = presetRevisionTokensRef.current.get(selected.id) ?? {
        revisionId: selected.revisionId,
        editVersion: selected.editVersion,
      };
      const response = await fetch(`/api/presets/${encodeURIComponent(selected.id)}/submit`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token),
      });
      const result = await response.json() as { preset?: PresetDashboardItem; issues?: PresetIssue[]; error?: string; code?: string; retryAfterSeconds?: number };
      if (!response.ok || !result.preset) {
        if (result.issues) {
          setSelected((current) => current ? { ...current, issues: result.issues } : current);
          setShowSubmissionIssues(true);
          return;
        }
        setActionError(result.error ?? "The preset could not be submitted.");
        return;
      }
      const submitted = dashboardItemToPreset(result.preset, tagLabels);
      clearLocalDraft(result.preset.id);
      serverContentByPresetRef.current.set(result.preset.id, JSON.stringify(result.preset.content));
      updateDashboardItems((current) => {
        const exists = current.some((item) => item.id === result.preset!.id);
        return exists ? current.map((item) => item.id === result.preset!.id ? result.preset! : item) : [result.preset!, ...current];
      });
      setShowSubmissionIssues(false);
      selectPreset(submitted, false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The preset could not be submitted. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  const deleteSelectedPreset = async () => {
    if (!selected?.persisted || !selected.canEdit) return;
    if (!window.confirm("Are you sure you want to remove this preset? This action cannot be undone.")) return;

    try {
      const response = await fetch(`/api/presets/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "The preset could not be deleted.");
      }

      clearLocalDraft(selected.id);
      serverContentByPresetRef.current.delete(selected.id);
      presetRevisionTokensRef.current.delete(selected.id);
      updateDashboardItems((current) => current.filter((item) => item.id !== selected.id));
      setShowSubmissionIssues(false);
      dismissPreset();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The preset could not be deleted. Try again.");
    }
  };
  const addTag = (slug: string) => {
    if (!draftContent || draftContent.tags.includes(slug) || draftContent.tags.length >= 8) return;
    updateDraftContent((content) => content.tags.includes(slug) || content.tags.length >= 8
      ? content
      : { ...content, tags: [...content.tags, slug] });
    setTagPickerOpen(false);
    setTagQuery("");
  };
  const removeTag = (slug: string) => {
    if (draftContent) updateDraftContent((content) => ({ ...content, tags: content.tags.filter((tag) => tag !== slug) }));
  };
  const uploadThumbnail = async (file: File) => {
    if (!selected?.persisted || !isEditing) return;
    if (file.size > MAX_THUMBNAIL_UPLOAD_BYTES) {
      setThumbnailStatus("error");
      setThumbnailError("Pic must be no larger than 2 MB.");
      return;
    }
    setThumbnailStatus("uploading");
    setThumbnailError("");
    try {
      const optimizedBlob = await optimizeThumbnailForUpload(file);
      const body = new FormData();
      body.set("image", optimizedBlob, file.name.replace(/\.[^.]+$/, ".webp"));
      const response = await fetch(`/api/presets/${encodeURIComponent(selected.id)}/thumbnail`, { method: "POST", credentials: "same-origin", body });
      const result = await response.json() as { key?: string; url?: string; error?: string };
      if (!response.ok || !result.key || !result.url) throw new Error(result.error ?? "Pic could not be uploaded.");
      setFailedThumbnailIds((prev) => {
        if (!prev.has(selected.id)) return prev;
        const next = new Set(prev);
        next.delete(selected.id);
        return next;
      });
      setSelected((current) => current ? { ...current, image: result.url } : current);
      updateDraftContent((content) => ({ ...content, thumbnailKey: result.key! }));
      setThumbnailStatus("idle");
    } catch (error) {
      setThumbnailStatus("error");
      setThumbnailError(error instanceof Error ? error.message : "Pic could not be uploaded.");
    } finally {
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    }
  };
  const removeThumbnail = () => {
    if (!selected || thumbnailStatus === "uploading") return;
    if (!draftContent?.thumbnailKey && !selected.image) return;
    const nextContent = draftContent ? { ...draftContent, thumbnailKey: null } : null;
    if (nextContent) {
      updateDraftContent(nextContent);
    }
    setSelected((current) => current ? { ...current, image: undefined } : current);
    setFailedThumbnailIds((current) => {
      if (!current.has(selected.id)) return current;
      const next = new Set(current);
      next.delete(selected.id);
      return next;
    });
    setThumbnailStatus("idle");
    setThumbnailError("");
    void fetch(`/api/presets/${encodeURIComponent(selected.id)}/thumbnail`, {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => undefined);
    if (nextContent) {
      void persistDraft(selected, nextContent, JSON.stringify(nextContent)).catch(() => undefined);
    }
  };
  const matchingTags = tagCatalog.filter((tag) => !draftContent?.tags.includes(tag.slug) && tag.label.toLowerCase().includes(tagQuery.trim().toLowerCase()));
  const revalidationIssues: PresetIssue[] = revalidationFailedId === selected?.id ? [
    { source: "validation", field: "revalidation", code: "outdated", message: "Update failed - showing cached version that may be outdated." }
  ] : [];
  const visibleSubmissionIssues = [
    ...(selected?.state === "draft" && (showSubmissionIssues || selected.workingStatus === "rejected") ? selected.issues ?? [] : []),
    ...revalidationIssues,
  ];

  return (
    <main className="app-shell">
      <section className="sr-only" aria-label="About StraftatPresets">
        <h1>StraftatPresets — Community Presets, Weapon Randomizer & Map Playlists for STRAFTAT</h1>
        <p>
          Discover, generate, and share custom game configurations for the arena duel shooter STRAFTAT.
          Features {supportedWeaponCount} balanced weapons, {supportedMapCount} official maps, custom weapon weight randomizers, base64 map playlist codes, and swapper remap settings.
        </p>
      </section>
      <header className="topbar">
        <Link className="wordmark" href="/">STRAFTATPRESETS</Link>
        <nav className="tool-tabs" aria-label="StraftatPresets sections">
          <button className="active" type="button">Community Presets</button>
          <a className="tool-tab-link" href="https://straftools.vercel.app/" target="_blank" rel="noreferrer">
            <span className="tab-title-row">Preset Builder<svg className="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></span>
            <span className="tab-author">by clodcan</span>
          </a>
          <a className="tool-tab-link" href="https://matthewknorr.github.io/StraftatFX/" target="_blank" rel="noreferrer">
            <span className="tab-title-row"><span className="fx-link-text">Text Colors</span><svg className="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></span>
            <span className="tab-author">by Matthew Knorr</span>
          </a>
        </nav>
        <div className="topbar-meta"><p><span>made by <strong>klammvs</strong></span><span className="credit-separator" aria-hidden="true" /><span className="credit-inspired"><span>inspired by</span><span className="inspired-stack"><a href="https://straftools.vercel.app/" target="_blank" rel="noreferrer">STRAFTOOLS</a><span className="inspired-author">by clodcan</span></span></span></p><AuthControl onProfileChange={handleProfileChange} nameDialogRequested={isProfileEditorRequested} onNameDialogClose={() => setIsProfileEditorRequested(false)} /></div>
      </header>

      <div className="workspace">
        <section className="preset-browser" aria-label="Community presets">
          <div className="dashboard-toolbar">
            <div className="dashboard-views" role="group" aria-label="Preset order">
              <button className={activeDashboardView === "popular" ? "active" : ""} type="button" onClick={() => chooseDashboardView("popular")}>Popular</button>
              <button className={activeDashboardView === "updated" || activeDashboardView === "newest" ? "active" : ""} type="button" onClick={() => chooseDashboardView("updated")}>Updated</button>
              {authStatus === "authenticated" ? <button className={activeDashboardView === "mine" ? "active" : ""} type="button" onClick={() => chooseDashboardView("mine")}>My Presets</button> : null}
            </div>
            <div className="search-row">
              <div className="search-input-wrap">
                <input aria-label="Search community presets" placeholder="Search..." value={query} onChange={(event) => {
                  setSelectedSearchTags([]);
                  setSelectedSearchWeapons([]);
                  setQuery(event.target.value);
                }} />
                <div className="search-tools-right">
                  {query ? <button className="search-tool-btn search-clear-inline" type="button" aria-label="Clear search" title="Clear search" onClick={() => { setQuery(""); setSelectedSearchTags([]); setSelectedSearchWeapons([]); }}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button> : null}
                  <button className={`search-tool-btn ${searchTagPickerOpen ? "active" : ""}`} type="button" aria-label="Filter by tag" title="Filter by tag" onClick={() => { setSearchTagPickerOpen((prev) => !prev); setWeaponPickerOpen(false); }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  </button>
                  <button ref={weaponPickerTriggerRef} className={`search-tool-btn ${weaponPickerOpen ? "active" : ""}`} type="button" aria-label="Filter by weapon" title="Filter by weapon" onClick={() => { setWeaponPickerOpen((prev) => !prev); setSearchTagPickerOpen(false); }}>
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="15" width="15" xmlns="http://www.w3.org/2000/svg"><path d="M11 5.07089C7.93431 5.5094 5.5094 7.93431 5.07089 11H7V13H5.07089C5.5094 16.0657 7.93431 18.4906 11 18.9291V17H13V18.9291C16.0657 18.4906 18.4906 16.0657 18.9291 13H17V11H18.9291C18.4906 7.93431 16.0657 5.5094 13 5.07089V7H11V5.07089ZM3.05493 11C3.51608 6.82838 6.82838 3.51608 11 3.05493V1H13V3.05493C17.1716 3.51608 20.4839 6.82838 20.9451 11H23V13H20.9451C20.4839 17.1716 17.1716 20.4839 13 20.9451V23H11V20.9451C6.82838 20.4839 3.51608 17.1716 3.05493 13H1V11H3.05493ZM15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z" /></svg>
                  </button>
                </div>
                {searchTagPickerOpen ? <SearchTagPicker tags={tagCatalogEntries} onSelect={(tag) => {
                  setQuery(tag.label);
                  setSelectedSearchTags([{ slug: tag.slug, label: tag.label }]);
                  setSelectedSearchWeapons([]);
                  setSearchTagPickerOpen(false);
                }} onClose={() => setSearchTagPickerOpen(false)} /> : null}
                {weaponPickerOpen ? <RadialWeaponPicker triggerRef={weaponPickerTriggerRef} weapons={catalogWeapons} onSelect={(weaponName) => {
                  const weapon = catalogWeapons.find((candidate) => candidate.name === weaponName);
                  if (weapon) setSelectedSearchWeapons((current) => current.some((candidate) => candidate.gameId === weapon.gameId) ? current : [...current, { gameId: weapon.gameId, name: weapon.name }]);
                  setQuery((current) => {
                    const terms = current.split(",").map((term) => term.trim()).filter(Boolean);
                    if (terms.some((term) => term.toLocaleLowerCase("en-US") === weaponName.toLocaleLowerCase("en-US"))) return current;
                    return [...terms, weaponName].join(", ");
                  });
                }} onClose={() => setWeaponPickerOpen(false)} /> : null}
              </div>
            </div>
            <button className="submit-preset" type="button" disabled={authStatus === "loading" || isCreating} onClick={submitPreset}>{isCreating ? "Opening draft…" : "＋ Submit preset"}</button>
          </div>

          {visiblePresets.length ? <div className="preset-grid">{(() => {
            type GridItem = { type: "single"; preset: typeof visiblePresets[0]; index: number } | { type: "group"; presets: [typeof visiblePresets[0], typeof visiblePresets[0]]; indices: [number, number] };
            const items: GridItem[] = [];
            let i = 0;
            while (i < visiblePresets.length) {
              const p1 = visiblePresets[i];
              if (!p1.image && i + 1 < visiblePresets.length && !visiblePresets[i + 1].image) {
                items.push({ type: "group", presets: [p1, visiblePresets[i + 1]], indices: [i, i + 1] });
                i += 2;
              } else {
                items.push({ type: "single", preset: p1, index: i });
                i += 1;
              }
            }

            const renderCard = (preset: typeof visiblePresets[0], presetIndex: number, compact: boolean) => {
              const version = latestVersion(preset); const labels = configLabels(version);
              const isOwner = Boolean(preset.canEdit);
              const showStateBadge = activeDashboardView === "mine" && Boolean(preset.state);
              const hasValidImage = Boolean(preset.image && !failedThumbnailIds.has(preset.id));
              return <article className={`preset-card ${compact ? "compact" : ""} ${isOwner ? "is-owner" : ""}`} key={preset.id}>
                <button className="card-open" type="button" onClick={() => openPreset(preset)} aria-label={`Open ${preset.title} ${version.label}`}>
                  {!compact ? (hasValidImage ? <div className="preset-image"><Image src={preset.image!} alt="" fill priority={presetIndex < 4} sizes="(max-width: 480px) 100vw, (max-width: 720px) 50vw, (max-width: 980px) 33vw, 25vw" onError={() => handleThumbnailError(preset.id)} /></div> : <div className="preset-image no-image"><ThumbnailPlaceholder title={preset.title} mode="card" /></div>) : null}
                  <div className="preset-card-body">
                    <div className="preset-title-row"><h2><StraftatText text={preset.title} /></h2><div className="card-badges">{showStateBadge && preset.state ? <PresetStateBadge state={preset.state} /> : null}{preset.versioningEnabled ? <span className="version-badge">{formatPresetVersionLabel(version.label)}</span> : null}</div></div>
                    <p>{formatCardDescriptionPreview(preset.description)}</p>
                    <div className="content-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>
                    <div className="tag-row">{preset.tags.slice(0, compact ? 3 : MAX_VISIBLE_PRESET_TAGS).map((tag) => <span key={tag}>{tag}</span>)}</div>
                    <div className="preset-author"><span>by <StraftatText text={preset.author} /></span></div>
                  </div>
                </button>
                {!preset.state || preset.state === "published" ? <CopyCount count={copyCount(preset)} /> : null}
              </article>;
            };

            const showCreateSlot = activeDashboardView === "mine" && authStatus === "authenticated" && !query && storedPresets.length < MAX_PRESETS_PER_AUTHOR;

            return (
              <>
                {items.map((item, idx) => {
                  if (item.type === "group") {
                    return <div className="preset-card-group" key={`group-${idx}`}>
                      {renderCard(item.presets[0], item.indices[0], true)}
                      {renderCard(item.presets[1], item.indices[1], true)}
                    </div>;
                  }
                  return renderCard(item.preset, item.index, false);
                })}
                {showCreateSlot ? (
                  <button className="create-preset-slot" type="button" disabled={isCreating} onClick={submitPreset} aria-label="Create preset">
                    <span className="create-slot-icon" aria-hidden="true"><PlusIcon /></span>
                    <span className="create-slot-title">{isCreating ? "Opening draft…" : "Create preset"}</span>
                    <span className="create-slot-desc">Create, edit, and submit presets anytime.</span>
                  </button>
                ) : null}
              </>
            );
          })()}</div> : !isViewLoaded || (searchActive ? searchLoading : dashboardLoading)
            ? <div className="empty-state"><h2>{searchActive ? "Searching presets…" : "Loading presets…"}</h2><p>{searchActive ? searchError : dashboardError}</p></div>
            : activeDashboardView === "mine" && authStatus === "authenticated" && !query
            ? <div className="preset-grid">
                <button className="create-preset-slot" type="button" disabled={isCreating} onClick={submitPreset} aria-label="Create preset">
                  <span className="create-slot-icon" aria-hidden="true"><PlusIcon /></span>
                  <span className="create-slot-title">{isCreating ? "Opening draft…" : "Create preset"}</span>
                  <span className="create-slot-desc">Create, edit, and submit presets anytime.</span>
                </button>
              </div>
            : <div className="empty-state"><h2>No presets found</h2><p>{searchError || dashboardError || (activeDashboardView === "mine" ? "No published presets matched your search." : "Try a different search.")}</p></div>}
        </section>
      </div>

      {selected && selectedVersion && <div className="dialog-backdrop" role="presentation" onMouseDown={closePreset}>
        <div className={`dialog-stage ${visibleSubmissionIssues.length ? "has-submission-issues" : ""}`} onMouseDown={(event) => event.stopPropagation()}>
          <section ref={dialogSectionRef} tabIndex={-1} className={`preset-dialog ${isRevalidating ? "is-revalidating" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" type="button" aria-label="Close preset" disabled={isSubmitting} onClick={closePreset}>×</button>
          {(() => {
            const selectedHasValidImage = Boolean(selected.image && !failedThumbnailIds.has(selected.id));
            return (
              <div className={`dialog-hero ${selectedHasValidImage ? "" : "no-image"}`}>
                {selectedHasValidImage ? (
                  <div className="dialog-hero-image">
                    <Image src={selected.image!} alt="" fill loading="eager" sizes="290px" onError={() => handleThumbnailError(selected.id)} />
                  </div>
                ) : (
                  <ThumbnailPlaceholder title={selected.title} mode="hero" />
                )}
                {isEditing ? (
                  <div className="thumbnail-editor">
                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Upload pic"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) trackPendingEditorChange(uploadThumbnail(file));
                      }}
                    />
                    <div className="thumbnail-actions">
                      <button
                        type="button"
                        className="thumbnail-btn"
                        aria-label={thumbnailStatus === "uploading" ? "Checking picture…" : selected.image ? "Change picture" : "Add picture"}
                        disabled={thumbnailStatus === "uploading"}
                        onClick={() => thumbnailInputRef.current?.click()}
                      >
                        <ReplacePicIcon />
                        <span>{thumbnailStatus === "uploading" ? "Checking pic…" : selected.image ? "Change picture" : "Add picture"}</span>
                      </button>
                      {draftContent?.thumbnailKey || selected.image ? (
                        <button
                          type="button"
                          className="thumbnail-btn"
                          aria-label="Remove picture"
                          disabled={thumbnailStatus === "uploading"}
                          onClick={removeThumbnail}
                        >
                          <RemoveIcon />
                          <span>Remove picture</span>
                        </button>
                      ) : null}
                    </div>
                    {thumbnailError ? (
                      <p className="thumbnail-error field-error-message">{thumbnailError}</p>
                    ) : (
                      <div className="thumbnail-hint">
                        <span className="thumbnail-theme-rule">STRAFTAT-themed only</span>
                        <span>No NSFW, gore, or graphic violence</span>
                        <span>JPEG/PNG/WebP, 2 MB max</span>
                        <span>Suggested: 16:9, 720p+</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })()}
          <div className={`dialog-content ${!isEditing && selectedVersion.randomizedWeapons ? "has-weapon-atmosphere" : ""} ${isDialogScrolling ? "is-scrolling" : ""}`} onScroll={handleDialogScroll}>
            {!isEditing && selectedVersion.randomizedWeapons ? <WeaponMix key={`${selected.id}-${selectedVersion.label}`} weapons={selectedVersion.randomizedWeapons} copyButtonRef={weaponCopyButtonRef} copyBurst={weaponCopyBurst} /> : null}
            <div className="dialog-heading"><div className="dialog-title-block"><div className="dialog-title-line">{isEditing && draftContent ? <input id="dialog-title" className="dialog-title-input" aria-label="Preset name" maxLength={MAX_PRESET_TITLE_CHARACTERS} value={draftContent.title} onChange={(event) => updateDraftContent((content) => ({ ...content, title: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /> : <h2 id="dialog-title"><StraftatText text={selected.title} /></h2>}{(isEditing ? draftContent?.versioningEnabled : selected.versioningEnabled) ? <span className="version-badge">{formatPresetVersionLabel(isEditing && draftContent ? draftContent.versions[editorVersionIndex]?.label || "-" : selectedVersion.label)}</span> : null}</div><p><span className="byline-author">by <StraftatText text={selected.author} /></span>{selectedVersion.released && selectedVersion.released !== "Published" ? <><span className="byline-separator" aria-hidden="true" />{selectedVersion.released}</> : null}</p></div><div className="dialog-actions">
              <div className="dialog-actions-main">
                {selected.state ? <PresetStateBadge state={selected.state} /> : null}
                {selected.canEdit ? <button className="edit-preset-button icon-only" type="button" title={isEditing ? "View" : "Edit"} aria-label={isEditing ? "View" : "Edit"} disabled={isSubmitting} onClick={() => { if (isEditing) { void exitEditMode(); } else { enterEditMode(); } }}>{isEditing ? <ViewIcon /> : <EditIcon />}</button> : null}
                {!isEditing ? <button className={`copy-link-button icon-only ${copied === "link" ? "copied" : ""}`} type="button" title={copied === "link" ? "Copied!" : "Copy link"} aria-label="Copy link" onClick={() => { const url = new URL(window.location.href); const identifier = presetUrlIdentifier(selected); url.searchParams.set("p", identifier); void copyText("link", url.toString()).catch(() => undefined); }}>{copied === "link" ? <CheckIcon /> : <LinkIcon />}</button> : null}
                {selected.state === "draft" ? <button className="submit-review-button" type="button" disabled={isSubmitting || saveStatus === "saving" || thumbnailStatus === "uploading"} onClick={() => void submitSelectedPreset()}>{isSubmitting ? "Submitting…" : "Submit"}</button> : null}
                {!selected.state || selected.state === "published" ? <CopyCount count={copyCount(selected)} dialog /> : null}
              </div>
              {selected.canEdit ? <button className="remove-preset-button icon-only" type="button" title="Remove preset" aria-label="Remove preset" disabled={isSubmitting} onClick={() => void deleteSelectedPreset()}><RemoveIcon /></button> : null}
            </div></div>
            {isEditing ? <p className={`autosave-status ${saveStatus}`}>{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Saved on this device - sync failed" : "Changes autosave"}</p> : null}
            {!isEditing && selected.versioningEnabled && selected.versions.length > 1 && <div className="version-picker"><span>Version</span>{sortPresetVersionsNewestFirst(selected.versions).map((version) => <button className={version.label === selectedVersion.label ? "active" : ""} key={version.label} type="button" onClick={() => { setVersionLabel(version.label); setCopied(null); setWeaponSort("name"); setSortDirection("asc"); setWeaponCopyBurst(0); }}>{formatPresetVersionLabel(version.label)}</button>)}</div>}
            {isEditing && draftContent ? (
              <div className="editable-field">
                <textarea
                  className="dialog-description-input"
                  aria-label="Preset description"
                  maxLength={MAX_PRESET_DESCRIPTION_CHARACTERS}
                  placeholder="What makes your preset unique compared to similar ones? Which weapons, maps, or rules define the gameplay, and how is it tuned to be played?"
                  value={draftContent.description}
                  onChange={(event) => updateDraftContent((content) => ({ ...content, description: event.target.value }))}
                />
                <div className="field-meta">
                  {hasConsecutiveEmptyLines(draftContent.description) ? (
                    <small className="field-error-message">Cannot have consecutive empty lines</small>
                  ) : countTextLines(draftContent.description) > MAX_PRESET_DESCRIPTION_LINES ? (
                    <small className="field-error-message">Must be 10 lines or fewer</small>
                  ) : <span />}
                  <span className="field-counts">
                    <span>{draftContent.description.length}/{MAX_PRESET_DESCRIPTION_CHARACTERS}</span>
                    <span>{countTextLines(draftContent.description)}/{MAX_PRESET_DESCRIPTION_LINES} lines</span>
                  </span>
                </div>
              </div>
            ) : (
              <p className="dialog-description">{selected.description}</p>
            )}

            {isEditing && draftContent ? <div className="editable-tags"><small>{draftContent.tags.length}/8 tags</small>
              <div className="tag-row">{draftContent.tags.map((slug) => <button key={slug} type="button" title="Remove tag" onClick={() => removeTag(slug)}>{labelFromSlug(slug, tagLabels)}<span aria-hidden="true">×</span></button>)}{draftContent.tags.length < 8 ? <button className="add-tag" type="button" aria-label="Add tag" aria-expanded={tagPickerOpen} onClick={() => setTagPickerOpen((open) => !open)}><PlusIcon /></button> : null}</div>
              {tagPickerOpen ? <div className="tag-picker"><input autoFocus aria-label="Search tags" placeholder="Search tags" value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} /> <div>{matchingTags.map((tag) => <button key={tag.slug} type="button" onClick={() => addTag(tag.slug)}>{tag.label}</button>)}</div></div> : null}
            </div> : <div className="tag-row">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}

            {isEditing && draftContent ? <PresetContentEditor content={draftContent} activeVersionIndex={editorVersionIndex} onActiveVersionChange={setEditorVersionIndex} onChange={updateDraftContent} onPendingChange={trackPendingEditorChange} /> : null}

            {!isEditing && selectedVersion.randomizedWeapons ? <PresetSection title="Randomized weapons" count={selectedVersion.randomizedWeapons.length} action={<div className="randomized-weapons-actions">
              <span className="manual-entry-note">Enter manually in-game</span>
              <RandomizedWeaponsGuide />
              <button key={`weapon-copy-${weaponCopyBurst}`} className={`weapon-copy-button icon-only ${weaponCopyBurst ? "is-receiving" : ""}`} ref={weaponCopyButtonRef} type="button" data-tooltip={copied === "weapons" ? "Copied as plain text" : "Copy as plain text"} aria-label={copied === "weapons" ? "Copied randomized weapons as plain text" : "Copy randomized weapons as plain text"} onClick={() => copyWeapons(selectedVersion.randomizedWeapons!, selectedVersion.randomizedWeaponsCopyKey)}>{copied === "weapons" ? <CheckIcon /> : <CopyCountIcon />}</button>
            </div>}>
              <div className="weapon-table-wrap"><table className="weapon-list"><thead><tr><th aria-sort={sortState("name")}><button type="button" onClick={() => changeWeaponSort("name")}>Weapon <span>{sortArrow("name")}</span></button></th><th aria-sort={sortState("weight")}><button type="button" onClick={() => changeWeaponSort("weight")}>Weight <span>{sortArrow("weight")}</span></button></th><th aria-sort={sortState("percent")}><button type="button" onClick={() => changeWeaponSort("percent")}>Chance <span>{sortArrow("percent")}</span></button></th></tr></thead><tbody>{sortedWeapons.map((weapon) => {
                const imageUrl = getWeaponImage(weapon.name);
                return <tr key={weapon.name}><td><div className="weapon-table-name">{imageUrl ? <Image src={imageUrl} alt="" width={34} height={34} className="weapon-table-thumb" /> : null}<span>{weapon.name}</span></div></td><td>{weapon.weight}</td><td><span className="chance"><i style={{ width: `${weapon.percent}%` }} />{formatWeaponPercent(weapon.percent)}</span></td></tr>;
              })}</tbody></table></div>
            </PresetSection> : null}

            {!isEditing && selectedVersion.swapper?.length ? <PresetSection title="Swapper settings" count={selectedVersion.swapper.length}>
              <div className="export-list">{selectedVersion.swapper.map((swapper, index) => <ExportRow key={`swapper-${index}-${swapper.name}`} title={swapper.name} description={swapper.description} code={swapper.code} copied={copied === `swapper-${index}`} onCopy={() => void copyText(`swapper-${index}`, swapper.code, swapper.copyKey).catch(() => undefined)} />)}</div>
            </PresetSection> : null}

            {!isEditing && selectedVersion.maps?.length ? <PresetSection title="Map playlists" count={selectedVersion.maps.length}>
              <div className="export-list">{selectedVersion.maps.map((playlist, index) => <PlaylistRow key={`playlist-${index}-${playlist.name}`} playlist={playlist} copied={copied === `map-${index}`} onCopy={() => void copyText(`map-${index}`, playlist.code, playlist.copyKey).catch(() => undefined)} />)}</div>
            </PresetSection> : null}
            <p className="catalog-support"><span>Validated for STRAFTAT {supportedGameRelease.version}</span><span className="catalog-separator" aria-hidden="true" /><span>{supportedMapCount} maps</span><span className="catalog-separator" aria-hidden="true" /><span>{supportedWeaponCount} weapons</span></p>
          </div>
        </section>
        {visibleSubmissionIssues.length ? <SubmissionIssueRail issues={visibleSubmissionIssues} content={draftContent ?? selected.content} /> : null}
        </div>
      </div>}
      {authPrompt ? <AuthDialog onClose={() => setAuthPrompt(null)} onContinue={() => {
        const callbackUrl = new URL(window.location.href);
        callbackUrl.searchParams.set("create", "1");
        window.sessionStorage.setItem("justLoggedIn", "true");
        void signIn("discord", { callbackUrl: callbackUrl.toString() });
      }} /> : null}
      {actionError ? <div className="action-toast" role="status"><Image src="/barrel.png" alt="" width={26} height={26} className="toast-barrel-icon" /><div>{actionError}</div><button type="button" aria-label="Dismiss" onClick={() => setActionError("")}>×</button></div> : null}
    </main>
  );
}

function PresetSection({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="preset-section"><header><h3>{title}<span>{count}</span></h3>{action}</header>{children}</section>;
}
function RandomizedWeaponsGuide() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16, width: 410 });
  const steps = [
    "Open randomized weapon settings",
    "Find the listed weapon",
    "Enter the shown weight",
    "Repeat for every weapon",
  ];
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const edge = 16;
    const gap = 12;
    const width = Math.min(410, window.innerWidth - edge * 2);
    const estimatedHeight = Math.min(330, window.innerHeight - edge * 2);
    const left = Math.max(edge, rect.left - width - gap);
    const maximumTop = Math.max(edge, window.innerHeight - estimatedHeight - edge);
    const top = Math.min(maximumTop, Math.max(edge, rect.top + rect.height / 2 - estimatedHeight / 2));
    setPosition({ left, top, width });
  }, []);
  const openGuide = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    updatePosition();
    setIsOpen(true);
  }, [updatePosition]);
  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 120);
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, updatePosition]);
  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);
  return <div className="randomized-weapons-guide">
    <button ref={triggerRef} className="guide-trigger icon-only" type="button" aria-label="How to enter randomized weapons" aria-expanded={isOpen} aria-describedby={isOpen ? "randomized-weapons-guide" : undefined} onMouseEnter={openGuide} onMouseLeave={scheduleClose} onFocus={openGuide} onBlur={scheduleClose} onClick={() => isOpen ? setIsOpen(false) : openGuide()}>?</button>
    {isOpen && typeof document !== "undefined" ? createPortal(<aside className="guide-popover" id="randomized-weapons-guide" role="tooltip" style={position} onMouseEnter={openGuide} onMouseLeave={scheduleClose}>
      <header><strong>Enter randomized weapons</strong><p>Manual entry only. Copy is plain text.</p></header>
      <ol>{steps.map((step, index) => <li key={step}>
        <div className="guide-screenshot" aria-hidden="true"><span>Game UI screenshot</span></div>
        <p><b>{index + 1}</b>{step}</p>
      </li>)}</ol>
    </aside>, document.body) : null}
  </div>;
}
function CopyCount({ count, dialog = false }: { count: number; dialog?: boolean }) {
  return <span className={`copy-count ${dialog ? "dialog-copy-count" : ""}`} aria-label={`${count.toLocaleString()} ${count === 1 ? "copy" : "copies"}`}><CopyCountIcon /><b>{count.toLocaleString()}</b></span>;
}
function ExpandableName({ text }: { text: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    if (textRef.current) {
      setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    checkTruncation();
    const handleResize = () => checkTruncation();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [text, checkTruncation]);

  return (
    <strong
      className={`playlist-name-text ${isTruncated ? "is-truncated" : ""}`}
      onMouseEnter={checkTruncation}
    >
      <span ref={textRef} className="name-truncated">
        <StraftatText text={text} />
      </span>
      {isTruncated ? (
        <span className="name-expanded" aria-hidden="true">
          <StraftatText text={text} />
        </span>
      ) : null}
    </strong>
  );
}

function ExportRow({ title, description, code, copied, onCopy }: { title: string; description: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="export-item playlist-item">
      <div className="export-copy">
        <div className="playlist-name">
          <ExpandableName text={title} />
        </div>
        {description ? <p>{description}</p> : null}
        <code>{code}</code>
      </div>
      <button type="button" onClick={onCopy}>{copied ? <><CheckIcon /> Copied</> : "▣ Copy"}</button>
    </div>
  );
}
function PlaylistRow({ playlist, copied, onCopy }: { playlist: MapPlaylist; copied: boolean; onCopy: () => void }) {
  return (
    <div className="export-item playlist-item">
      <div className="export-copy">
        <div className="playlist-name">
          <ExpandableName text={playlist.name} />
          <span>{playlist.mapCount} {playlist.mapCount === 1 ? "map" : "maps"}</span>
        </div>
        <p>{playlist.description}</p>
        <code>{playlist.code}</code>
      </div>
      <button type="button" onClick={onCopy}>{copied ? <><CheckIcon /> Copied</> : "▣ Copy"}</button>
    </div>
  );
}
function ThumbnailPlaceholder({ title, mode = "card" }: { title: string; mode?: "card" | "hero" }) {
  const plainTitle = useMemo(() => stripColorAndFormattingTags(title), [title]);
  const visibleLength = plainTitle.length;
  const maxWordLength = useMemo(() => {
    const words = plainTitle.split(/\s+/).filter(Boolean);
    return words.reduce((max, w) => Math.max(max, w.length), 0);
  }, [plainTitle]);

  const style = useMemo<React.CSSProperties>(() => {
    if (mode === "hero") {
      let targetPx: number;
      if (visibleLength <= 4) targetPx = 68;
      else if (visibleLength <= 8) targetPx = 54;
      else if (visibleLength <= 14) targetPx = 44;
      else if (visibleLength <= 22) targetPx = 36;
      else if (visibleLength <= 34) targetPx = 28;
      else if (visibleLength <= 48) targetPx = 22;
      else if (visibleLength <= 65) targetPx = 18;
      else targetPx = 15;

      if (maxWordLength > 0) {
        const maxFitPx = Math.floor(270 / (maxWordLength * 0.57));
        targetPx = Math.min(targetPx, Math.max(14, maxFitPx));
      }

      const lineHeight = targetPx >= 40 ? 1.04 : targetPx >= 28 ? 1.08 : targetPx >= 20 ? 1.14 : 1.2;
      return {
        fontFamily: "var(--font-jost), sans-serif",
        fontSize: `${targetPx}px`,
        lineHeight,
        width: "100%",
        maxWidth: "100%",
      };
    }

    let targetPx: number;
    if (visibleLength <= 6) targetPx = 34;
    else if (visibleLength <= 12) targetPx = 29;
    else if (visibleLength <= 22) targetPx = 24;
    else if (visibleLength <= 36) targetPx = 19;
    else if (visibleLength <= 52) targetPx = 15;
    else targetPx = 12;

    if (maxWordLength > 0) {
      const maxFitPx = Math.floor(230 / (maxWordLength * 0.6));
      targetPx = Math.min(targetPx, Math.max(11, maxFitPx));
    }

    const lineHeight = targetPx >= 20 ? 1.12 : targetPx >= 14 ? 1.18 : 1.25;
    return {
      fontFamily: "var(--font-jost), sans-serif",
      fontSize: `${targetPx}px`,
      lineHeight,
      width: "100%",
      maxWidth: "100%",
    };
  }, [mode, visibleLength, maxWordLength]);

  return (
    <strong style={style}>
      <StraftatText text={title} />
    </strong>
  );
}

function SubmissionIssueRail({ issues, content }: { issues: PresetIssue[]; content?: PresetRevisionContent }) {
  return <aside className="submission-issue-rail" aria-label="Preset submission issues"><ul>{issues.map((issue, index) => <li key={`${issue.code}-${issue.field}-${index}`}><Image src="/barrel.png" alt="" width={40} height={40} /><span>{content ? formatPresetIssueMessage(issue, content) : issue.message}</span></li>)}</ul></aside>;
}
function AuthDialog({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  return (
    <div className="auth-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="auth-dialog-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        <h2 id="auth-title">Quick sign-in</h2>
        <p>Discord keeps accounts unique. We only keep your ID and username; choose any public display name after signing in.</p>
        <button className="discord-signin" type="button" onClick={onContinue}>
          <Image src="/discord-symbol.svg" alt="" width={20} height={15} />
          Continue with Discord
        </button>
      </section>
    </div>
  );
}
function PresetStateBadge({ state }: { state: UserPresetState }) {
  return <span className={`preset-state ${state}`}>{state[0].toUpperCase() + state.slice(1)}</span>;
}
function EditIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
}
function ViewIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function RemoveIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>;
}
function LinkIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
}
function CopyCountIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>;
}
function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function ReplacePicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-4-4a2 2 0 0 0-2.83 0L6 19" />
      <path d="M14 7h3a1.5 1.5 0 0 1 1.5 1.5V10" />
      <path d="m15.5 5.5 1.5 1.5-1.5 1.5" />
      <path d="M18 13h-3a1.5 1.5 0 0 1-1.5-1.5V10" />
      <path d="m16.5 14.5-1.5-1.5 1.5-1.5" />
    </svg>
  );
}
