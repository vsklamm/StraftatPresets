import type { PresetRevisionContent } from "@/src/domain/preset-content";
import type { ModerationFlag, ModerationResult } from "./types";
import { extractModeratableFields, getChangedModeratableFields } from "./extract-fields";
import { checkLevel1Limits } from "./level1-limits";
import { checkLevel2HardReject } from "./level2-hard-reject";
import { checkLevel3Computery } from "./level3-computery";
import { checkLevel4QualityAndLibraries } from "./level4-quality-libraries";

export * from "./types";
export * from "./strip-color-codes";
export * from "./extract-fields";
export * from "./level1-limits";
export * from "./level2-hard-reject";
export * from "./level3-computery";
export * from "./level4-quality-libraries";
export * from "./link-detection";

export function runClientModeration(content: PresetRevisionContent): ModerationResult {
  const fields = extractModeratableFields(content);

  // Level 1: Field limits & placeholders
  const level1 = checkLevel1Limits(fields);
  if (level1.decision === "rejected") {
    return level1;
  }

  // Level 2: Hard-reject prohibited vocabulary
  const level2 = checkLevel2HardReject(fields);
  if (level2.decision === "rejected") {
    return level2;
  }

  return {
    decision: "approved",
    level: 1,
    flags: [],
    summary: "Passed client moderation checks",
  };
}

export async function runServerModeration(
  content: PresetRevisionContent,
  options: { previousContent?: PresetRevisionContent | null } = {},
): Promise<ModerationResult> {
  const allFields = extractModeratableFields(content);
  const allFlags: ModerationFlag[] = [];

  // Level 1: Field limits & placeholders (100% reject against invalid/malformed limits)
  const level1 = checkLevel1Limits(allFields);
  if (level1.decision === "rejected") {
    return level1;
  }

  // Level 2: Hard-reject prohibited vocabulary (100% reject)
  const level2 = checkLevel2HardReject(allFields);
  if (level2.decision === "rejected") {
    return level2;
  }

  // Review only text that changed after the first publication.
  const fieldsForReview = options.previousContent
    ? getChangedModeratableFields(options.previousContent, content)
    : allFields;

  if (fieldsForReview.length > 0) {
    // Level 3: Computery's Profanity Filter
    const level3 = checkLevel3Computery(fieldsForReview);
    if (level3.flags.length > 0) {
      allFlags.push(...level3.flags);
    }

    // Level 4: Quality & Secondary Libraries
    const level4 = checkLevel4QualityAndLibraries(fieldsForReview);
    if (level4.decision === "rejected") {
      return level4;
    }
    if (level4.flags.length > 0) {
      allFlags.push(...level4.flags);
    }

  }

  if (allFlags.length > 0) {
    return {
      decision: "review_required",
      flags: allFlags,
      summary: `Flagged by moderation pipeline (${allFlags.length} notice(s))`,
    };
  }

  return {
    decision: "approved",
    flags: [],
    summary: "Approved by all moderation levels",
  };
}
