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

export const RANDOMIZER_SETTINGS_LABEL_TMPRO =
  "<#DDA270>R<#E1A074>a<#E49E79>n<#E79C7E>d<#E99A84>o<#EB998A>m<#EB9890>i<#D0A771>z<#9EB679>e<#66BEA2>r <#7CB3E8>S<#BEA3DB>e<#ADA7E2>t<#9AACE7>t<#85B1E9>i<#70B5E8>n<#5BB8E4>g<#49BBDC>s";

export const SWAPPER_SETTING_LABEL_TMPRO =
  "<#5EB8DF>S<#54BADA>w<#4EBCD4>a<#4CBDCC>p<#4EBDC4>p<#53BEBB>e<#5BBEB2>r <#5BBEB2>S<#54BEBA>e<#4FBEC1>t<#4DBDC9>t<#4DBCCF>i<#50BBD5>n<#5EB8DF>g";

export const SWAPPER_SETTINGS_LABEL_TMPRO =
  "<#5EB8DF>S<#54BADA>w<#4EBCD4>a<#4CBDCC>p<#4EBDC4>p<#53BEBB>e<#5BBEB2>r <#5BBEB2>S<#54BEBA>e<#4FBEC1>t<#4DBDC9>t<#4DBCCF>i<#50BBD5>n<#55BADB>g<#5EB8DF>s";

export function configLabels(version: PresetVersion): string[] {
  return [
    version.maps?.length ? `${version.maps.length} Map Playlist${version.maps.length === 1 ? "" : "s"}` : null,
    version.randomizedWeapons ? RANDOMIZER_SETTINGS_LABEL_TMPRO : null,
    version.swapper?.length
      ? `${version.swapper.length} ${version.swapper.length === 1 ? SWAPPER_SETTING_LABEL_TMPRO : SWAPPER_SETTINGS_LABEL_TMPRO}`
      : null,
  ].filter(Boolean) as string[];
}

