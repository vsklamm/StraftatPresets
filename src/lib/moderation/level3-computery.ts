// SPDX-License-Identifier: Apache-2.0
// TypeScript adaptation of https://github.com/C0mputery/ComputerysProfanityFilter/tree/main/ComputerysProfanityFilter

import type { ModeratableField, ModerationFlag, ModerationResult } from "./types";

const Terms: readonly string[] = [
  "ass", "ahole", "asshole", "arsehole", "asshat", "asswipe",
  "bastard",
  "bitch", "biatch",
  "bullshit",
  "cock", "cocksucker",
  "cunt", "kunt",
  "dick", "dickhead",
  "dipshit",
  "douchebag",
  "dumbass", "dumbfuck",
  "fuck", "fcuk", "fuk", "fuq", "fux", "fux0r", "fvck", "fxck", "fucker", "fucking",
  "motherfucker",
  "piss",
  "shit", "shithead", "shitty",
  "slut",
  "twat",
  "wank",
  "wanker",
  "whore",
  "assfuck", "assfucker",
  "bitchass",
  "buttfuck",
  "clusterfuck",
  "cockbite", "cockface", "cockfucker", "cockhead", "cockmunch", "cocknugget",
  "cumdumpster",
  "cuntface",
  "dickbag", "dickface", "dickwad", "dickweed",
  "dumbcunt", "dumbshit",
  "fatass",
  "fuckboy", "fuckface", "fuckhead", "fuckstick", "fucktard", "fuckwit",
  "jackass",
  "knobhead",
  "pigfucker",
  "shitbag", "shitcunt", "shitface", "shithole", "shitstain",
  "skullfuck",
  "slutbag",
  "son of a bitch",
  "twathead",
  "whoreface",
  "baluga",
  "beaner",
  "chink",
  "cholo",
  "coon",
  "dago",
  "darkie",
  "dyke",
  "fag", "faggot",
  "gas the jews",
  "gayass", "gaybob", "gaydo", "gayfuck", "gayfuckist", "gaylord", "gaytard", "gaywad",
  "gook",
  "gypsy",
  "hitler",
  "homo",
  "kike",
  "kill all blacks", "kill all jews", "kill the blacks", "kill the jews",
  "lesbo",
  "mongoloid",
  "nazi", "nazism", "neonazi",
  "nigger", "nigga", "niga", "nigra", "niggle", "niglet", "nigress", "negro", "neger", "nig nog", "nig-nog", "nigaboo",
  "paki",
  "raghead",
  "rape",
  "retard", "reetard", "ritard", "r-tard", "tard",
  "sambo",
  "shemale",
  "sieg heil", "sig heil",
  "sissy",
  "spic",
  "towelhead",
  "tranny",
  "wetback",
  "kill yourself", "kill your self", "kill you're self", "kys",
  "卐", "卍",
  "\u0fd5", "\u0fd6", "\u0fd7", "\u0fd8",
  "ꖦ",
  "ᛋᛋ",
  "⚡⚡",
];

const AllowTerms: readonly string[] = [
  "as",
  "con",
  "go ok",
  "a hole",
];

const CharacterMap: Record<string, string> = {
  "4": "a", "@": "a", "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "ā": "a", "ă": "a", "ą": "a", "ǎ": "a", "ǟ": "a", "ǻ": "a", "а": "a", "α": "a",
  "8": "b", "ß": "b", "в": "b", "β": "b",
  "<": "c", "¢": "c", "ç": "c", "ć": "c", "ĉ": "c", "ċ": "c", "č": "c", "с": "c",
  "ď": "d", "đ": "d", "ð": "d", "ԁ": "d", "δ": "d",
  "3": "e", "€": "e", "è": "e", "é": "e", "ê": "e", "ë": "e", "ē": "e", "ĕ": "e", "ė": "e", "ę": "e", "ě": "e", "е": "e", "ε": "e",
  "ƒ": "f",
  "ĝ": "g", "ğ": "g", "ġ": "g", "ģ": "g",
  "#": "h", "ĥ": "h", "ħ": "h", "һ": "h", "н": "h",
  "!": "i", "1": "i", "|": "i", "¡": "i", "ì": "i", "í": "i", "î": "i", "ï": "i", "ī": "i", "ĭ": "i", "į": "i", "ı": "i", "і": "i", "ι": "i",
  "ĵ": "j", "ј": "j",
  "ķ": "k", "ĸ": "k", "к": "k", "κ": "k",
  "ĺ": "l", "ļ": "l", "ľ": "l", "ł": "l",
  "м": "m",
  "ñ": "n", "ń": "n", "ņ": "n", "ň": "n", "ŉ": "n", "ŋ": "n", "η": "n",
  "0": "o", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o", "ō": "o", "ŏ": "o", "ő": "o", "ơ": "o", "о": "o", "ο": "o",
  "р": "p", "ρ": "p",
  "ԛ": "q",
  "ŕ": "r", "ŗ": "r", "ř": "r",
  "5": "s", "$": "s", "ś": "s", "ŝ": "s", "ş": "s", "š": "s", "ș": "s", "ſ": "s", "ѕ": "s",
  "+": "t", "7": "t", "ţ": "t", "ť": "t", "ŧ": "t", "ț": "t", "т": "t", "τ": "t",
  "ù": "u", "ú": "u", "û": "u", "ü": "u", "ū": "u", "ŭ": "u", "ů": "u", "ű": "u", "ų": "u", "ư": "u", "υ": "u", "μ": "u",
  "ν": "v",
  "ŵ": "w", "ω": "w",
  "х": "x", "χ": "x",
  "¥": "y", "ý": "y", "ÿ": "y", "ŷ": "y", "у": "y", "γ": "y",
  "2": "z", "ź": "z", "ż": "z", "ž": "z",
  "æ": "ae",
  "ﬀ": "ff",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "œ": "oe",
  "ﬅ": "ft",
  "ﬆ": "st",
  "þ": "th",
};

const SequenceMap: Record<string, string> = {
  "/\\/\\": "m",
  "|\\/|": "m",
  "\\/\\/": "w",
  "|/\\|": "w",
  "|\\|": "n",
  "|/|": "n",
  "/\\/": "n",
  "|-|": "h",
  "|_|": "u",
  "/\\": "a",
  "\\/": "v",
  "|3": "b",
  "|)": "d",
  "|<": "k",
  "|{": "k",
  "><": "x",
  "}{": "x",
};

const JoinerCharacters = new Set<string>([
  "\u00AD", "\u034F", "\u061C", "\u180E", "\u200B", "\u200C", "\u200D", "\u200E", "\u200F",
  "\u2060", "\u2061", "\u2062", "\u2063", "\u2064", "\u2066", "\u2067", "\u2068", "\u2069", "\uFEFF",
]);

for (let code = 0x0300; code <= 0x036F; code++) {
  JoinerCharacters.add(String.fromCharCode(code));
}
for (let code = 0xFE00; code <= 0xFE0F; code++) {
  JoinerCharacters.add(String.fromCharCode(code));
}
for (let d = 0; d <= 9; d++) {
  const ch = d.toString();
  if (!CharacterMap[ch]) {
    JoinerCharacters.add(ch);
  }
}

const BoundaryCharacters = new Set<string>([
  ".", "_", "-", "*", "/", "\\", "~", "^", "=", "`", "'", '"', ",", ";", ":", "?", "!", "#", "$",
  "%", "&", "+", "@", "|", "¿", "…", "–", "—", "•", "·", "(", ")", "[", "]", "{", "}", "<", ">",
  "‐", "‑", "‒", "―", "‽", "⁃", "‚", "„", "‟", "‘", "’", "“", "”", "‹", "›",
  "、", "。", "〃", "〈", "〉", "《", "》", "「", "」", "『", "』", "【", "】", "〔", "〕",
]);

function collapseRepeatedCharacters(text: string): string {
  let result = "";
  let prev = "";
  for (const ch of text.toLowerCase()) {
    if (ch !== prev) {
      result += ch;
      prev = ch;
    }
  }
  return result;
}

function isConsonant(ch: string): boolean {
  return /^[bcdfghjklmnpqrstvwxyz]$/i.test(ch);
}

function addWordForms(word: string, forms: Set<string>) {
  forms.add(word);
  if (word.length <= 2) return;

  const stem = word.slice(0, -1);
  const lastChar = word.slice(-1);
  const endsWithE = word.endsWith("e");

  forms.add(word + "s");
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z") || word.endsWith("ch") || word.endsWith("sh")) {
    forms.add(word + "es");
  }

  if (word.endsWith("y") && isConsonant(word.slice(-2, -1))) {
    forms.add(stem + "ies");
    forms.add(stem + "ied");
    forms.add(stem + "ier");
    forms.add(stem + "iest");
    forms.add(stem + "ie");
  }

  for (const suffix of ["ed", "ing", "er"]) {
    forms.add(word + suffix);
    if (isConsonant(lastChar)) {
      forms.add(word + lastChar + suffix);
    }
  }

  if (endsWithE) {
    forms.add(stem + "ed");
    forms.add(stem + "ing");
    forms.add(stem + "er");
  }

  if (word.endsWith("ie")) {
    forms.add(word.slice(0, -2) + "ying");
  }

  if (!word.endsWith("ish")) {
    forms.add(word + "ish");
    if (endsWithE) {
      forms.add(stem + "ish");
    }
  }
}

function encodeString(input: string): string {
  let encoded = "";
  let i = 0;
  const len = input.length;

  while (i < len) {
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    let matchedSeq = false;
    for (const [seq, replacement] of Object.entries(SequenceMap)) {
      if (input.startsWith(seq, i)) {
        encoded += replacement;
        i += seq.length;
        matchedSeq = true;
        break;
      }
    }
    if (matchedSeq) continue;

    const rawChar = input[i];
    const ch = rawChar.toLowerCase();
    i++;

    if (CharacterMap[ch]) {
      encoded += CharacterMap[ch];
      continue;
    }

    if (JoinerCharacters.has(ch) || BoundaryCharacters.has(ch)) {
      continue;
    }

    encoded += ch;
  }

  return collapseRepeatedCharacters(encoded);
}

const compiledPatterns = new Map<string, string>();

function buildPatterns() {
  for (const term of Terms) {
    if (!term) continue;

    if (term.includes(" ")) {
      const tokens = term.split(/\s+/);
      const tokenForms: Set<string>[] = tokens.map((t) => {
        const s = new Set<string>();
        addWordForms(t, s);
        return s;
      });

      const buildCombinations = (index: number, current: string[]) => {
        if (index === tokenForms.length) {
          const phrase = current.join(" ");
          const encoded = encodeString(phrase);
          if (encoded && !compiledPatterns.has(encoded)) {
            compiledPatterns.set(encoded, term);
          }
          return;
        }
        for (const variant of tokenForms[index]) {
          current[index] = variant;
          buildCombinations(index + 1, current);
        }
      };

      buildCombinations(0, new Array(tokens.length));
    } else {
      const forms = new Set<string>();
      addWordForms(term, forms);
      for (const form of forms) {
        const encoded = encodeString(form);
        if (encoded && !compiledPatterns.has(encoded)) {
          compiledPatterns.set(encoded, term);
        }
      }
    }
  }
}

buildPatterns();

function isTokenAllowed(token: string): boolean {
  const clean = token.trim().toLowerCase();
  for (const allow of AllowTerms) {
    if (clean === allow.toLowerCase()) {
      return true;
    }
  }
  return false;
}

export function scanTextForProfanity(input: string): string[] {
  if (!input) return [];

  const matchedTerms: string[] = [];
  const words = input.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const rawWord = words[i];
    if (isTokenAllowed(rawWord)) continue;

    // Check single word token
    const encoded = encodeString(rawWord);
    if (encoded) {
      if (compiledPatterns.has(encoded)) {
        const term = compiledPatterns.get(encoded)!;
        if (!matchedTerms.includes(term)) {
          matchedTerms.push(term);
        }
      } else {
        // Check if encoded token starts with a root pattern
        for (const [pattern, term] of compiledPatterns.entries()) {
          if (pattern.length >= 3 && encoded.startsWith(pattern)) {
            if (!matchedTerms.includes(term)) {
              matchedTerms.push(term);
            }
          }
        }
      }
    }

    // Check multi-word combinations (up to 4 consecutive words)
    for (let span = 2; span <= 4 && i + span <= words.length; span++) {
      const phrase = words.slice(i, i + span).join(" ");
      if (isTokenAllowed(phrase)) continue;

      const encodedPhrase = encodeString(phrase);
      if (encodedPhrase && compiledPatterns.has(encodedPhrase)) {
        const term = compiledPatterns.get(encodedPhrase)!;
        if (!matchedTerms.includes(term)) {
          matchedTerms.push(term);
        }
      }
    }
  }

  return matchedTerms;
}

export function checkLevel3Computery(fields: ModeratableField[]): ModerationResult {
  const flags: ModerationFlag[] = [];

  for (const field of fields) {
    const matches = scanTextForProfanity(field.cleanText);
    for (const term of matches) {
      flags.push({
        level: 3,
        tier: "profanity_filter",
        field: field.path,
        code: "computery_profanity_detected",
        message: `Potential profanity detected in ${field.label}`,
        matchedTerm: term,
      });
    }
  }

  return {
    decision: flags.length === 0 ? "approved" : "review_required",
    level: 3,
    flags,
    summary: flags.length === 0 ? "Passed Computery profanity filter" : `Detected ${flags.length} profanity match(es)`,
  };
}
