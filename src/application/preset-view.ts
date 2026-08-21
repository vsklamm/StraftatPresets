import type { PresetRevisionContent } from "@/src/domain/preset-content";
import type { PresetIssue, PresetRevisionStatus, UserPresetState } from "@/src/domain/preset-workflow";
import type { WeightedWeapon } from "@/src/domain/weapon-weights";

export type MapPlaylist = { name: string; mapCount: number; description: string; code: string };
export type PresetVersion = {
  id?: string;
  label: string;
  released: string;
  maps?: MapPlaylist[];
  randomizedWeapons?: WeightedWeapon[];
  swapper?: Array<{ name: string; description: string; code: string }>;
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
  likes: number;
  publishedDaysAgo: number;
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
};
