import type { ModeratableField, ModerationFlag, ModerationResult } from "./types";

const HARD_REJECT_TERMS = [
  "nigger",
  "nigga",
  "faggot",
  "kike",
  "chink",
  "gook",
  "spic",
  "wetback",
  "raghead",
  "towelhead",
  "gas the jews",
  "kill all jews",
  "kill the jews",
  "kill all blacks",
  "kill the blacks",
  "sieg heil",
  "sig heil",
  "hitler",
  "nazi",
  "nazism",
  "neonazi",
  "kill yourself",
  "kill your self",
  "kill you're self",
  "kys",
  "卐",
  "卍",
  "\u0fd5",
  "\u0fd6",
  "\u0fd7",
  "\u0fd8",
  "ꖦ",
  "ᛋᛋ",
  "⚡⚡",
];

const SYMBOL_TERMS = new Set(["卐", "卍", "\u0fd5", "\u0fd6", "\u0fd7", "\u0fd8", "ꖦ", "ᛋᛋ", "⚡⚡"]);

export function checkLevel2HardReject(fields: ModeratableField[]): ModerationResult {
  const flags: ModerationFlag[] = [];

  for (const field of fields) {
    const textLower = field.cleanText.toLowerCase();

    for (const term of HARD_REJECT_TERMS) {
      let isMatch = false;

      if (SYMBOL_TERMS.has(term)) {
        isMatch = textLower.includes(term);
      } else if (term.includes(" ")) {
        isMatch = textLower.includes(term);
      } else {
        const regex = new RegExp(`\\b${term}\\b`, "i");
        isMatch = regex.test(textLower);
      }

      if (isMatch) {
        flags.push({
          level: 2,
          tier: "hard_reject",
          field: field.path,
          code: "hard_rejected_term",
          message: `Contains prohibited language in ${field.label}`,
          matchedTerm: term,
        });
        break;
      }
    }
  }

  return {
    decision: flags.length === 0 ? "approved" : "rejected",
    level: 2,
    flags,
    summary: flags.length === 0 ? "Passed hard-reject vocabulary check" : `Hard-rejected on ${flags.length} prohibited term(s)`,
  };
}
