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
