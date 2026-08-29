import { checkLevel2HardReject } from "@/src/lib/moderation/level2-hard-reject";
import { checkLevel3Computery } from "@/src/lib/moderation/level3-computery";
import { checkLevel4QualityAndLibraries } from "@/src/lib/moderation/level4-quality-libraries";
import { detectLinks } from "@/src/lib/moderation/link-detection";
import type { ModeratableField } from "@/src/lib/moderation/types";
import { validateUserDisplayNameStructure, type UserDisplayNameValidation } from "@/src/domain/user-profile";

export { normalizeUserDisplayName } from "@/src/domain/user-profile";

export function validateUserDisplayName(value: string): UserDisplayNameValidation {
  const structural = validateUserDisplayNameStructure(value);
  if ("error" in structural || structural.displayName === null) return structural;
  if (detectLinks(structural.displayName).hasLink) {
    return { error: "Links are not allowed in display names." };
  }

  const field: ModeratableField = {
    path: "displayName",
    label: "display name",
    rawText: structural.displayName,
    cleanText: structural.visibleName,
    hasColorCodes: structural.displayName !== structural.visibleName,
  };
  const flags = [
    ...checkLevel2HardReject([field]).flags,
    ...checkLevel3Computery([field]).flags,
    ...checkLevel4QualityAndLibraries([field]).flags.filter((flag) =>
      flag.code === "profanity_library_match" || flag.code === "non_english_profanity_dictionary_match"),
  ];
  if (flags.length > 0) return { error: "Choose another display name." };
  return structural;
}
