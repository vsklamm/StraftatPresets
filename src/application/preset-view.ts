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

export const RANDOMIZER_SETTINGS_LABEL_TMPRO =
  "<#C6A89B>R<#C4A899>a<#C2A997>n<#BFAA96>d<#BCAB95>o<#B9AC95>m<#B6AE95>i<#B2AF95>z<#AFB096>e<#ABB197>r <#A4B29B>S<#A0B39D>e<#9DB4A0>t<#99B4A3>t<#96B5A6>i<#94B5A9>n<#91B5AC>g<#8FB5B0>s";

export const SWAPPER_SETTING_LABEL_TMPRO =
  "<#94B2C4>S<#91B3C2>w<#8FB4BF>a<#8DB5BC>p<#8DB5B8>p<#8EB5B4>e<#8FB5B0>r <#8FB5B0>S<#8EB5B4>e<#8DB5B8>t<#8DB5BC>t<#8FB4BF>i<#91B3C2>n<#94B2C4>g";

export const SWAPPER_SETTINGS_LABEL_TMPRO =
  "<#94B2C4>S<#91B3C2>w<#8FB4C0>a<#8DB4BD>p<#8DB5B9>p<#8DB5B5>e<#8FB5B1>r <#91B5AD>S<#8FB5B1>e<#8DB5B5>t<#8DB5B9>t<#8DB4BD>i<#8FB4C0>n<#91B3C2>g<#94B2C4>s";


export function configLabels(version: PresetVersion): string[] {
  return [
    version.maps?.length ? `${version.maps.length} Map Playlist${version.maps.length === 1 ? "" : "s"}` : null,
    version.randomizedWeapons ? RANDOMIZER_SETTINGS_LABEL_TMPRO : null,
    version.swapper?.length
      ? `${version.swapper.length} ${version.swapper.length === 1 ? SWAPPER_SETTING_LABEL_TMPRO : SWAPPER_SETTINGS_LABEL_TMPRO}`
      : null,
  ].filter(Boolean) as string[];
}

