import type { PresetRevisionContent } from "@/src/domain/preset-content";
import { formatPresetVersionLabel } from "@/src/domain/preset-version";
import type { PresetIssue } from "@/src/domain/preset-workflow";

const VERSION_FIELD = /^versions\.(\d+)(?:\.(mapPlaylists|weaponConfigurations)(?:\.(\d+))?)?/;

export function formatPresetIssueMessage(issue: PresetIssue, content: PresetRevisionContent): string {
  const match = VERSION_FIELD.exec(issue.field);
  if (!match) return issue.message;

  const versionIndex = Number(match[1]);
  const version = content.versions[versionIndex];
  if (!version) return issue.message;

  const locations: string[] = [];
  if (content.versioningEnabled) {
    locations.push(`Version ${formatPresetVersionLabel(version.label) || versionIndex + 1}`);
  }

  const collection = match[2];
  const itemIndex = match[3] === undefined ? undefined : Number(match[3]);
  if (collection === "mapPlaylists" && itemIndex !== undefined && version.mapPlaylists[itemIndex]) {
    locations.push(`Map Playlist ${itemIndex + 1}`);
  } else if (collection === "weaponConfigurations" && itemIndex !== undefined) {
    const configuration = version.weaponConfigurations[itemIndex];
    if (configuration?.kind === "swapper") {
      const swapperNumber = version.weaponConfigurations
        .slice(0, itemIndex + 1)
        .filter((item) => item.kind === "swapper").length;
      locations.push(`Swapper ${swapperNumber}`);
    }
  }

  if (!locations.length) return issue.message;
  const location = locations.join(", ");
  return `${location[0].toUpperCase()}${location.slice(1)}: ${issue.message}`;
}
