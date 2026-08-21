import { Profanity, ProfanityOptions } from "@2toad/profanity";
import { franc } from "franc-min";
import { PROFANITY_ALLOWLIST } from "@/src/infrastructure/profanity-allowlist";
import type { ModeratableField, ModerationFlag, ModerationResult } from "./types";

export const PROFANITY_LANGUAGE_CODES = [
  "en",
  "fr",
  "es",
  "de",
  "ru",
  "zh",
  "ar",
  "pt",
  "it",
  "hi",
  "ja",
  "ko",
] as const;

const PROJECT_PROFANITY_TERMS = [
  "suka",
  "blyat",
  "cyka",
  "pidor",
  "pidaras",
  "xuy",
  "пидор",
  "долбоеб",
  "долбоёб",
  "пидарас",
  "ебаный",
  "他妈的",
  "操你妈",
  "قحبة",
  "شرموطة",
  "चूतिया",
  "भोसड़ी",
  "くそ",
  "씨발",
  "시발",
  "개새끼",
  "kurwa",
] as const;

const PROJECT_UNBOUNDED_PROFANITY_TERMS = [
  "他妈的",
  "操你妈",
  "くそ",
  "クソ",
  "ファック",
  "씨발",
  "시발",
  "개새끼",
] as const;

const options = new ProfanityOptions();
options.languages = [...PROFANITY_LANGUAGE_CODES];
options.wholeWord = true;
options.unicodeWordBoundaries = true;

const profanity = new Profanity(options);
profanity.whitelist.addWords(PROFANITY_ALLOWLIST);
profanity.addWords([...PROJECT_PROFANITY_TERMS]);

export const MASHING_REGEX = /(.)\1{4,}/i;
export const CONSONANT_MASH_REGEX = /[bcdfghjklmnpqrstvwxz]{7,}/i;
export const UPPERCASE_REGEX = /^[^a-z]*$/;

export function checkLevel4QualityAndLibraries(fields: ModeratableField[]): ModerationResult {
  const flags: ModerationFlag[] = [];

  for (const field of fields) {
    const { path, label, cleanText } = field;
    if (!cleanText) continue;

    // 1. Keyboard Mashing
    if (MASHING_REGEX.test(cleanText) || CONSONANT_MASH_REGEX.test(cleanText)) {
      flags.push({
        level: 4,
        tier: "quality",
        field: path,
        code: "low_quality_mashing",
        message: `Random character sequence or keyboard mashing detected in ${label}`,
      });
    }

    // 2. Excessive Capitalization
    if (cleanText.length > 10 && /[A-Z]/.test(cleanText) && UPPERCASE_REGEX.test(cleanText)) {
      flags.push({
        level: 4,
        tier: "quality",
        field: path,
        code: "low_quality_caps",
        message: `Excessive capitalization detected in ${label}`,
      });
    }

    // 3. Gibberish / Language Detection
    if (cleanText.length >= 10 && franc(cleanText) === "und") {
      flags.push({
        level: 4,
        tier: "quality",
        field: path,
        code: "gibberish",
        message: `Unrecognized language or gibberish in ${label}`,
      });
    }

    // 4. @2toad Profanity
    const textForProfanity = cleanText
      .replace(/\b(v?\d+(\.\d+)?|\d+v\d+)\b/gi, "")
      .normalize("NFKC");
    const normalizedText = textForProfanity.toLocaleLowerCase();
    const hasUnboundedMatch = PROJECT_UNBOUNDED_PROFANITY_TERMS.some((term) =>
      normalizedText.includes(term.toLocaleLowerCase()),
    );
    if (profanity.exists(textForProfanity) || hasUnboundedMatch) {
      flags.push({
        level: 4,
        tier: "quality",
        field: path,
        code: "profanity_library_match",
        message: `Flagged by secondary profanity dictionary in ${label}`,
      });
    }
  }

  return {
    decision: flags.length === 0 ? "approved" : "review_required",
    level: 4,
    flags,
    summary: flags.length === 0 ? "Passed quality and secondary library checks" : `Raised ${flags.length} quality flag(s)`,
  };
}
