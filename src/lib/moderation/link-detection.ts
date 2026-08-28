import { stripColorAndFormattingTags } from "@/src/domain/straftat-markup";

export const COMMON_TLDS = [
  "com", "org", "net", "edu", "gov", "mil", "io", "gg", "co", "xyz",
  "ru", "de", "uk", "be", "app", "dev", "me", "info", "biz", "site", "top",
  "online", "club", "store", "tv", "link", "live", "shop", "tech", "space",
  "pro", "cc", "to", "is", "ai", "ca", "us", "eu", "in", "cn", "nl",
  "fr", "ch", "se", "no", "fi", "pl", "cz", "es", "it", "jp", "kr",
  "br", "ua", "ly", "fm", "page", "social", "community", "world",
  "zone", "vip", "fun", "games", "bot", "press", "news",
] as const;

const TLD_PATTERN = COMMON_TLDS.join("|");

// Regex for direct protocols
const PROTOCOL_REGEX = /\b(?:https?|ftp|ws|wss|file|git):\/\/[^\s<>'"]+/i;

// Regex for www. prefix
const WWW_REGEX = /\bwww\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+[^\s<>'"]*/i;

// Regex for IPv4 address
const IP_ADDRESS_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::\d{1,5})?(?:\/[^\s]*)?\b/;

// Strict standard domain + TLD: word.tld (no space before or after dot, e.g. "site.com" or "site.com/abc")
const STANDARD_DOMAIN_REGEX = new RegExp(
  `\\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\\.(${TLD_PATTERN})\\b(?:[/:?#][^\\s<>'"]*)?`,
  "i",
);

export interface LinkDetectionResult {
  hasLink: boolean;
  matched?: string;
  reason?: string;
}

export function detectLinks(rawInput: string): LinkDetectionResult {
  if (!rawInput || typeof rawInput !== "string") {
    return { hasLink: false };
  }

  const cleanInput = stripColorAndFormattingTags(rawInput).trim();
  if (!cleanInput) {
    return { hasLink: false };
  }

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

  const domainMatch = cleanInput.match(STANDARD_DOMAIN_REGEX);
  if (domainMatch) {
    const domainPrefix = domainMatch[1]?.toLowerCase() ?? "";
    // Avoid false positives for known abbreviations like e.g. / i.e.
    if (domainPrefix.length === 1 && (domainPrefix === "e" || domainPrefix === "i")) {
      // Ignored abbreviation
    } else {
      return { hasLink: true, matched: domainMatch[0], reason: "domain_url" };
    }
  }

  return { hasLink: false };
}
