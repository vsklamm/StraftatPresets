import { stripColorAndFormattingTags } from "./strip-color-codes";

export const COMMON_TLDS = [
  "com", "org", "net", "edu", "gov", "mil", "io", "gg", "co", "xyz",
  "ru", "de", "uk", "app", "dev", "me", "info", "biz", "site", "top",
  "online", "club", "store", "tv", "link", "live", "shop", "tech", "space",
  "pro", "cc", "to", "is", "ai", "ca", "us", "eu", "in", "cn", "nl",
  "fr", "ch", "se", "no", "fi", "pl", "cz", "es", "it", "jp", "kr",
  "br", "ua", "ly", "fm", "page", "social", "community", "world",
  "zone", "vip", "fun", "games", "bot", "press", "news",
] as const;

// Distinct TLDs that do not clash with natural language words (prepositions/pronouns in French, German, Spanish, English, etc.)
export const DISTINCT_SPACED_TLDS = [
  "org", "net", "xyz", "io", "gg", "ru", "app", "dev", "site",
  "top", "online", "store", "tv", "link", "shop", "tech", "info", "biz",
  "pro", "games", "bot", "social", "community", "world", "zone", "vip", "fun",
] as const;

const TLD_PATTERN = COMMON_TLDS.join("|");
const DISTINCT_SPACED_TLD_PATTERN = DISTINCT_SPACED_TLDS.join("|");

// Regex for direct protocols
const PROTOCOL_REGEX = /\b(?:https?|ftp|ws|wss|file|git):\/\/[^\s<>'"]+/i;

// Regex for www. prefix
const WWW_REGEX = /\bwww\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+[^\s<>'"]*/i;

// Regex for IPv4 address
const IP_ADDRESS_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::\d{1,5})?(?:\/[^\s]*)?\b/;

// Social invite / platform shortcuts
const SOCIAL_SHORTCUT_REGEX = /\b(?:discord(?:\.gg|\.com\/invite)|dsc\.gg|t\.me|telegram\.me|bit\.ly|tinyurl\.com|goo\.gl|youtu\.be|youtube\.com|twitch\.tv|patreon\.com|ko-fi\.com|steamcommunity\.com)\b/i;

// Spaced social invites like "discord gg", "t me", "youtu be"
const SPACED_SOCIAL_REGEX = /\b(?:discord|dsc)\s+(?:gg|com)\b|\bt\s+me\b|\byoutu\s+be\b|\btwitch\s+tv\b/i;

// Spaced .com with path or known platform: "somewebsite com / path", "youtube com", "google com", etc.
const SPACED_COM_PATH_REGEX = /\b([a-z0-9-]{2,})\s+com\s*(?:\/|\s*slash\s*)\s*[a-z0-9_.-]+/i;
const KNOWN_PLATFORM_COM_REGEX = /\b(?:youtube|discord|google|github|reddit|twitch|steam|twitter|instagram|tiktok|roblox|spotify)\s+com\b/i;

// Strict standard domain + TLD: word.tld (no space before or after dot, e.g. "site.com" or "site.com/abc")
const STANDARD_DOMAIN_REGEX = new RegExp(
  `\\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\\.(${TLD_PATTERN})\\b(?:[/:?#][^\\s<>'"]*)?`,
  "i",
);

// Obfuscated spaced dot domain + TLD: "somewebsite .com", "somewebsite . com"
const SPACED_DOT_DOMAIN_REGEX = new RegExp(
  `\\b([a-z0-9-]{2,})\\s*\\.\\s*(${TLD_PATTERN})\\b`,
  "i",
);

// Obfuscated spaced domain + TLD with NO dot: "somewebsite net", "somewebsite ru", "somewebsite io"
const SPACED_NO_DOT_DOMAIN_REGEX = new RegExp(
  `\\b([a-z0-9-]{2,})\\s+(${DISTINCT_SPACED_TLD_PATTERN})\\b`,
  "i",
);

export interface LinkDetectionResult {
  hasLink: boolean;
  matched?: string;
  reason?: string;
}

function normalizeObfuscatedText(text: string): string {
  return text
    // Normalize unicode dots
    .replace(/[．。•·․‧●]/g, ".")
    // Normalize unicode slashes
    .replace(/[／＼⁄]/g, "/")
    // Normalize bracketed dots like [dot], (dot), {dot}, <dot>, [.], (.)
    .replace(/\s*\[\s*(?:dot|\.)\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*(?:dot|\.)\s*\)\s*/gi, ".")
    .replace(/\s*\{\s*(?:dot|\.)\s*\}\s*/gi, ".")
    .replace(/\s*<\s*(?:dot|\.)\s*>\s*/gi, ".")
    // Normalize standalone " dot "
    .replace(/\s+dot\s+/gi, ".")
    // Normalize bracketed slashes like [slash], (slash), [\]
    .replace(/\s*\[\s*(?:slash|\/|\\)\s*\]\s*/gi, "/")
    .replace(/\s*\(\s*(?:slash|\/|\\)\s*\)\s*/gi, "/")
    .replace(/\s*\{\s*(?:slash|\/|\\)\s*\}\s*/gi, "/")
    .replace(/\s*<\s*(?:slash|\/|\\)\s*>\s*/gi, "/")
    // Normalize standalone " slash "
    .replace(/\s+slash\s+/gi, "/");
}

export function detectLinks(rawInput: string): LinkDetectionResult {
  if (!rawInput || typeof rawInput !== "string") {
    return { hasLink: false };
  }

  // Pre-normalize bracketed/tagged dot evasions before tag stripping
  const preProcessed = rawInput
    .replace(/<\s*(?:dot|\.)\s*>/gi, ".")
    .replace(/<\s*(?:slash|\/|\\)\s*>/gi, "/");

  // 1. Strip all TMPro / color / formatting tags
  const cleanInput = stripColorAndFormattingTags(preProcessed).trim();
  if (!cleanInput) {
    return { hasLink: false };
  }

  // 2. Direct checks on cleanInput
  const protocolMatch = cleanInput.match(PROTOCOL_REGEX);
  if (protocolMatch) {
    return { hasLink: true, matched: protocolMatch[0], reason: "protocol_url" };
  }

  const wwwMatch = cleanInput.match(WWW_REGEX);
  if (wwwMatch) {
    return { hasLink: true, matched: wwwMatch[0], reason: "www_url" };
  }

  const ipMatch = cleanInput.match(IP_ADDRESS_REGEX);
  if (ipMatch) {
    return { hasLink: true, matched: ipMatch[0], reason: "ip_address" };
  }

  const socialMatch = cleanInput.match(SOCIAL_SHORTCUT_REGEX);
  if (socialMatch) {
    return { hasLink: true, matched: socialMatch[0], reason: "social_link" };
  }

  const spacedSocialMatch = cleanInput.match(SPACED_SOCIAL_REGEX);
  if (spacedSocialMatch) {
    return { hasLink: true, matched: spacedSocialMatch[0], reason: "spaced_social_link" };
  }

  // 3. Normalize obfuscated representations: [dot], (dot), dot, etc.
  const normalized = normalizeObfuscatedText(cleanInput);

  // Check protocol / www / ip / social again on normalized string
  const normProtocolMatch = normalized.match(PROTOCOL_REGEX);
  if (normProtocolMatch) {
    return { hasLink: true, matched: normProtocolMatch[0], reason: "protocol_url" };
  }

  const normWwwMatch = normalized.match(WWW_REGEX);
  if (normWwwMatch) {
    return { hasLink: true, matched: normWwwMatch[0], reason: "www_url" };
  }

  const normSocialMatch = normalized.match(SOCIAL_SHORTCUT_REGEX);
  if (normSocialMatch) {
    return { hasLink: true, matched: normSocialMatch[0], reason: "social_link" };
  }

  // 4. Standard domain + TLD check
  const domainMatch = normalized.match(STANDARD_DOMAIN_REGEX);
  if (domainMatch) {
    const domainPrefix = domainMatch[1]?.toLowerCase() ?? "";
    // Avoid false positives for known abbreviations like e.g. / i.e.
    if (domainPrefix.length === 1 && (domainPrefix === "e" || domainPrefix === "i")) {
      // Ignored abbreviation
    } else {
      return { hasLink: true, matched: domainMatch[0], reason: "domain_url" };
    }
  }

  // 5. Spaced dot domain + TLD (e.g. "somewebsite .com", "somewebsite . com")
  const spacedDotMatch = normalized.match(SPACED_DOT_DOMAIN_REGEX);
  if (spacedDotMatch) {
    const domainPrefix = spacedDotMatch[1]?.toLowerCase() ?? "";
    if (domainPrefix.length >= 2 && !/^\d+$/.test(domainPrefix)) {
      return { hasLink: true, matched: spacedDotMatch[0], reason: "spaced_dot_domain" };
    }
  }

  // 6. Spaced domain + TLD with NO dot (e.g. "somewebsite net", "somewebsite ru", "somewebsite io")
  const spacedNoDotMatch = normalized.match(SPACED_NO_DOT_DOMAIN_REGEX);
  if (spacedNoDotMatch) {
    const domainPrefix = spacedNoDotMatch[1]?.toLowerCase() ?? "";
    if (domainPrefix.length >= 2 && !/^\d+$/.test(domainPrefix)) {
      return { hasLink: true, matched: spacedNoDotMatch[0], reason: "spaced_no_dot_domain" };
    }
  }

  const platformComMatch = normalized.match(KNOWN_PLATFORM_COM_REGEX);
  if (platformComMatch) {
    return { hasLink: true, matched: platformComMatch[0], reason: "platform_com" };
  }

  const comPathMatch = normalized.match(SPACED_COM_PATH_REGEX);
  if (comPathMatch) {
    return { hasLink: true, matched: comPathMatch[0], reason: "spaced_com_path" };
  }

  return { hasLink: false };
}
