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

type NonEnglishLanguageCode = Exclude<(typeof PROFANITY_LANGUAGE_CODES)[number], "en">;

// The package's translated lists contain ordinary words, so only reviewed terms may trigger automatic rejection.
export const NON_ENGLISH_PROFANITY_TERMS = {
  fr: ["connard", "connasse", "putain", "merde", "salope", "enculé", "encule"],
  es: ["puta", "puto", "mierda", "cabrón", "cabron", "gilipollas", "hijo de puta"],
  de: ["scheiße", "scheisse", "arschloch", "hurensohn", "wichser"],
  ru: ["сука", "блять", "блядь", "хуй", "пидор", "долбоеб", "долбоёб", "пидарас", "ебаный"],
  zh: ["他妈的", "操你妈", "傻逼", "妈的"],
  ar: ["قحبة", "شرموطة", "كس", "زب"],
  pt: ["caralho", "puta", "merda", "filho da puta", "foda-se", "fodase"],
  it: ["stronzo", "stronza", "cazzo", "merda", "puttana"],
  hi: ["चूतिया", "भोसड़ी", "गांड", "हरामी"],
  ja: ["くそ", "クソ", "ファック", "ちくしょう"],
  ko: ["씨발", "시발", "개새끼", "지랄"],
} as const satisfies Record<NonEnglishLanguageCode, readonly string[]>;

const TRANSLITERATED_PROFANITY_TERMS = ["suka", "blyat", "cyka", "pidor", "pidaras", "xuy", "kurwa"] as const;
const UNBOUNDED_LANGUAGE_CODES = new Set<NonEnglishLanguageCode>(["zh", "ja", "ko"]);
const UNBOUNDED_NON_ENGLISH_PROFANITY_TERMS = Object.entries(NON_ENGLISH_PROFANITY_TERMS)
  .filter(([language]) => UNBOUNDED_LANGUAGE_CODES.has(language as NonEnglishLanguageCode))
  .flatMap(([, terms]) => terms);
const BOUNDED_NON_ENGLISH_PROFANITY_TERMS = [
  ...Object.entries(NON_ENGLISH_PROFANITY_TERMS)
    .filter(([language]) => !UNBOUNDED_LANGUAGE_CODES.has(language as NonEnglishLanguageCode))
    .flatMap(([, terms]) => terms),
  ...TRANSLITERATED_PROFANITY_TERMS,
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BOUNDED_NON_ENGLISH_PROFANITY_REGEX = new RegExp(
  `(?<![\\p{L}\\p{N}\\p{M}])(?:${BOUNDED_NON_ENGLISH_PROFANITY_TERMS.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}\\p{M}])`,
  "iu",
);

function containsNonEnglishProfanity(text: string) {
  const normalizedText = text.normalize("NFKC").toLocaleLowerCase();
  return BOUNDED_NON_ENGLISH_PROFANITY_REGEX.test(normalizedText)
    || UNBOUNDED_NON_ENGLISH_PROFANITY_TERMS.some((term) => normalizedText.includes(term.toLocaleLowerCase()));
}

function createEnglishProfanityDetector() {
  const options = new ProfanityOptions();
  options.languages = ["en"];
  options.wholeWord = true;
  options.unicodeWordBoundaries = true;

  const detector = new Profanity(options);
  detector.whitelist.addWords(PROFANITY_ALLOWLIST);
  return detector;
}

const englishProfanity = createEnglishProfanityDetector();

export const MASHING_REGEX = /(.)\1{4,}/i;
export const CONSONANT_MASH_REGEX = /[bcdfghjklmnpqrstvwxz]{7,}/i;
export const UPPERCASE_REGEX = /^[^a-z]*$/;

export function checkLevel4QualityAndLibraries(fields: ModeratableField[]): ModerationResult {
  const flags: ModerationFlag[] = [];
  let hasHardReject = false;

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

    // 4. Profanity dictionaries
    const textForProfanity = cleanText
      .replace(/\b(v?\d+(\.\d+)?|\d+v\d+)\b/gi, "")
      .normalize("NFKC");
    const hasEnglishMatch = englishProfanity.exists(textForProfanity);
    const hasNonEnglishMatch = containsNonEnglishProfanity(textForProfanity);

    if (hasNonEnglishMatch) {
      hasHardReject = true;
      flags.push({
        level: 4,
        tier: "hard_reject",
        field: path,
        code: "non_english_profanity_dictionary_match",
        message: `Contains profanity in ${label}`,
      });
    } else if (hasEnglishMatch) {
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
    decision: hasHardReject ? "rejected" : flags.length === 0 ? "approved" : "review_required",
    level: 4,
    flags,
    summary: hasHardReject
      ? "Rejected by non-English profanity dictionary"
      : flags.length === 0
        ? "Passed quality and secondary library checks"
        : `Raised ${flags.length} quality flag(s)`,
  };
}
