import type { PresetRevisionContent } from "@/src/domain/preset-content";
import type { PresetIssue, PresetRevisionStatus, UserPresetState } from "@/src/domain/preset-workflow";
import type { WeightedWeapon } from "@/src/domain/weapon-weights";

export type MapPlaylist = { name: string; mapCount: number; description: string; code: string; copyKey?: string };
export type PresetVersion = {
  id?: string;
  label: string;
  released: string;
  maps?: MapPlaylist[];
  randomizedWeapons?: WeightedWeapon[];
  randomizedWeaponsCopyKey?: string;
  swapper?: Array<{ name: string; description: string; code: string; copyKey?: string }>;
};
export type WeaponSortKey = "name" | "weight" | "percent";
export type SortDirection = "asc" | "desc";
export type Preset = {
  id: string;
  slug?: string;
  title: string;
  author: string;
  image?: string;
  thumbnailPosition?: { x: number; y: number };
  description: string;
  tags: string[];
  views: number;
  copies: number;
  versioningEnabled: boolean;
  versions: PresetVersion[];
  persisted?: boolean;
  state?: UserPresetState;
  workingStatus?: PresetRevisionStatus | null;
  canEdit?: boolean;
  revisionId?: string;
  editVersion?: number;
  hasPublishedRevision?: boolean;
  issues?: PresetIssue[];
  content?: PresetRevisionContent;
  copyPublicationId?: string;
};

type LinkablePreset = Pick<Preset, "id" | "slug" | "state" | "canEdit" | "hasPublishedRevision">;

export function presetStatusLabels(preset: Pick<Preset, "state" | "workingStatus" | "hasPublishedRevision">, hasLocalChanges = false): Array<{ state: UserPresetState; label: string }> {
  if (!preset.state) return [];
  const published = Boolean(preset.hasPublishedRevision || preset.state === "published");
  const labels: Array<{ state: UserPresetState; label: string }> = published ? [{ state: "published", label: "Published" }] : [];
  const working = preset.workingStatus ?? (preset.state === "published" ? null : preset.state);
  if (working === "pending") {
    labels.push({ state: "pending", label: "Pending" });
    if (hasLocalChanges) labels.push({ state: "draft", label: "New edits" });
  } else if (working === "rejected" && !hasLocalChanges) {
    labels.push({ state: "draft", label: "Needs changes" });
  } else if (working === "draft" || working === "rejected" || hasLocalChanges) {
    labels.push({ state: "draft", label: "Drafted" });
  }
  return labels;
}

export function presetIsReadyToSubmit(preset: Pick<Preset, "canEdit" | "state" | "workingStatus" | "issues" | "content">): boolean {
  return Boolean(preset.canEdit && preset.state === "draft" && preset.workingStatus === "draft"
    && preset.content && preset.issues?.length === 0);
}
export function presetHasPublishedLink(preset: LinkablePreset): boolean {
  return !preset.canEdit || preset.state === "published" || Boolean(preset.hasPublishedRevision);
}

export function presetUrlIdentifier(preset: LinkablePreset): string {
  return presetHasPublishedLink(preset) ? preset.slug || preset.id : preset.id;
}

export function presetUrlPath(preset: LinkablePreset): string {
  const identifier = encodeURIComponent(presetUrlIdentifier(preset));
  return presetHasPublishedLink(preset) ? `/p/${identifier}` : `/?p=${identifier}`;
}

export function presetIdentifierFromUrl(url: Pick<URL, "pathname" | "searchParams">): string | null {
  const match = /^\/p\/([^/]+)\/?$/.exec(url.pathname);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  return url.searchParams.get("p");
}

export function urlWithoutPreset(url: URL): string {
  if (/^\/p\/[^/]+\/?$/.test(url.pathname)) url.pathname = "/";
  url.searchParams.delete("p");
  return `${url.pathname}${url.search}${url.hash}`;
}

const RANDOMIZER_LABEL_TMPRO =
  "<#CCAB9D>R<#C6AEA1>a<#C0AFA3>n<#BBB1A6>d<#B4B2A7>o<#AEB4AA>m<#A7B5AD>i<#A0B6AF>z<#99B8B2>e<#90BAB4>r";

const SWAPPER_LABEL_TMPRO =
  "<#94B2C4>S<#8FB4BF>w<#8DB5B8>a<#8FB5B0>p<#8DB5B8>p<#8FB4BF>e<#94B2C4>r";

const SWAPPERS_LABEL_TMPRO =
  "<#94B2C4>S<#8FB4C0>w<#8DB5B9>a<#91B5AD>p<#91B5AD>p<#8DB5B9>e<#8FB4C0>r<#94B2C4>s";


export function configLabels(version: PresetVersion): string[] {
  return [
    version.maps?.length ? `${version.maps.length} Map Playlist${version.maps.length === 1 ? "" : "s"}` : null,
    version.randomizedWeapons ? RANDOMIZER_LABEL_TMPRO : null,
    version.swapper?.length
      ? `${version.swapper.length} ${version.swapper.length === 1 ? SWAPPER_LABEL_TMPRO : SWAPPERS_LABEL_TMPRO}`
      : null,
  ].filter(Boolean) as string[];
}
