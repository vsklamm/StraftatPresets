export const COLOR_AND_FORMAT_TAGS_REGEX = /<#[0-9a-fA-F]{3,8}>|<\/?[a-zA-Z0-9_]+(?:=[^>]+)?>/gi;
const TMPRO_TAG_SPLIT_REGEX = /(<#[0-9a-fA-F]{3,8}>|<\/?[a-zA-Z0-9_]+(?:=[^>]+)?>)/gi;

export function stripColorAndFormattingTags(text: string): string {
  if (!text) return "";
  return text.replace(COLOR_AND_FORMAT_TAGS_REGEX, "").trim();
}

export function hasColorOrFormattingTags(text: string): boolean {
  if (!text) return false;
  COLOR_AND_FORMAT_TAGS_REGEX.lastIndex = 0;
  return COLOR_AND_FORMAT_TAGS_REGEX.test(text);
}

const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: "000000",
  blue: "0000FF",
  cyan: "00FFFF",
  gray: "808080",
  grey: "808080",
  green: "00FF00",
  lightblue: "ADD8E6",
  lime: "00FF00",
  magenta: "FF00FF",
  maroon: "800000",
  navy: "000080",
  olive: "808000",
  orange: "FFA500",
  purple: "800080",
  red: "FF0000",
  silver: "C0C0C0",
  teal: "008080",
  white: "FFFFFF",
  yellow: "FFFF00",
};

export const STRAFTAT_TEXT_CONTRAST_BACKGROUNDS = {
  page: "#100f0c",
  surface: "#181611",
} as const;

const MIN_STRAFTAT_TEXT_CONTRAST_RATIO = 3;

type RgbaColor = { r: number; g: number; b: number; a: number };

function parseHexColor(hex: string): RgbaColor | undefined {
  if (!/^(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) return undefined;
  let r = 255, g = 255, b = 255, a = 255;
  if (hex.length === 3 || hex.length === 4) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
    if (hex.length === 4) {
      a = parseInt(hex[3] + hex[3], 16);
    }
  } else if (hex.length === 6 || hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    if (hex.length === 8) {
      a = parseInt(hex.slice(6, 8), 16);
    }
  }
  return { r, g, b, a };
}

function relativeLuminance({ r, g, b }: Omit<RgbaColor, "a">): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function compositeOver(color: RgbaColor, background: RgbaColor): Omit<RgbaColor, "a"> {
  const alpha = color.a / 255;
  return {
    r: color.r * alpha + background.r * (1 - alpha),
    g: color.g * alpha + background.g * (1 - alpha),
    b: color.b * alpha + background.b * (1 - alpha),
  };
}

function contrastRatio(first: Omit<RgbaColor, "a">, second: Omit<RgbaColor, "a">): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function resolveReadableTextColor(hex: string): string | undefined {
  const color = parseHexColor(hex);
  if (!color) return undefined;
  const isReadable = Object.values(STRAFTAT_TEXT_CONTRAST_BACKGROUNDS).every((backgroundHex) => {
    const background = parseHexColor(backgroundHex.slice(1));
    return background && contrastRatio(compositeOver(color, background), background) >= MIN_STRAFTAT_TEXT_CONTRAST_RATIO;
  });
  return isReadable ? `#${hex}` : undefined;
}

function isValidHighlightColor(hex: string): boolean {
  const color = parseHexColor(hex);
  if (!color || color.a < 50) return false;
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b >= 40;
}

export interface StraftatMarkupSpan {
  text: string;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  smallcaps?: boolean;
  allcaps?: boolean;
  lowercase?: boolean;
  superscript?: boolean;
  subscript?: boolean;
}

export function hasSpanStyles(span: StraftatMarkupSpan): boolean {
  return Boolean(
    span.color ||
    span.backgroundColor ||
    span.bold ||
    span.italic ||
    span.underline ||
    span.strikethrough ||
    span.smallcaps ||
    span.allcaps ||
    span.lowercase ||
    span.superscript ||
    span.subscript
  );
}

export function parseStraftatMarkup(rawText: string): StraftatMarkupSpan[] {
  if (!rawText) return [];

  // Fast path if no tags
  if (!rawText.includes("<")) {
    return [{ text: rawText }];
  }

  const parts = rawText.split(TMPRO_TAG_SPLIT_REGEX);
  const spans: StraftatMarkupSpan[] = [];

  const colorStack: Array<string | undefined> = [];
  const markStack: string[] = [];
  let bold = 0;
  let italic = 0;
  let underline = 0;
  let strikethrough = 0;
  let smallcaps = 0;
  let allcaps = 0;
  let lowercase = 0;
  let superscript = 0;
  let subscript = 0;
  let inNoparse = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // Handle noparse mode
    if (inNoparse) {
      if (part.toLowerCase() === "</noparse>") {
        inNoparse = false;
      } else {
        spans.push({
          text: part,
          color: colorStack[colorStack.length - 1],
          backgroundColor: markStack[markStack.length - 1],
          bold: bold > 0,
          italic: italic > 0,
          underline: underline > 0,
          strikethrough: strikethrough > 0,
          smallcaps: smallcaps > 0,
          allcaps: allcaps > 0,
          lowercase: lowercase > 0,
          superscript: superscript > 0,
          subscript: subscript > 0,
        });
      }
      continue;
    }

    // Shorthand hex color: <#RRGGBB>
    if (part.startsWith("<#") && part.endsWith(">")) {
      const hex = part.slice(2, -1);
      colorStack.push(resolveReadableTextColor(hex));
      continue;
    }

    const lowerTag = part.toLowerCase();

    if (lowerTag === "<noparse>") {
      inNoparse = true;
      continue;
    }

    // Closing tags
    if (lowerTag === "</color>") {
      colorStack.pop();
      continue;
    }
    if (lowerTag === "</b>") {
      bold = Math.max(0, bold - 1);
      continue;
    }
    if (lowerTag === "</i>") {
      italic = Math.max(0, italic - 1);
      continue;
    }
    if (lowerTag === "</u>") {
      underline = Math.max(0, underline - 1);
      continue;
    }
    if (lowerTag === "</s>" || lowerTag === "</strike>") {
      strikethrough = Math.max(0, strikethrough - 1);
      continue;
    }
    if (lowerTag === "</smallcaps>" || lowerTag === "</scap>") {
      smallcaps = Math.max(0, smallcaps - 1);
      continue;
    }
    if (lowerTag === "</allcaps>" || lowerTag === "</uppercase>") {
      allcaps = Math.max(0, allcaps - 1);
      continue;
    }
    if (lowerTag === "</lowercase>") {
      lowercase = Math.max(0, lowercase - 1);
      continue;
    }
    if (lowerTag === "</casing>") {
      allcaps = Math.max(0, allcaps - 1);
      lowercase = Math.max(0, lowercase - 1);
      continue;
    }
    if (lowerTag === "</sup>") {
      superscript = Math.max(0, superscript - 1);
      continue;
    }
    if (lowerTag === "</sub>") {
      subscript = Math.max(0, subscript - 1);
      continue;
    }
    if (lowerTag === "</mark>") {
      markStack.pop();
      continue;
    }

    // Opening tags
    if (lowerTag === "<b>") {
      bold++;
      continue;
    }
    if (lowerTag === "<i>") {
      italic++;
      continue;
    }
    if (lowerTag === "<u>") {
      underline++;
      continue;
    }
    if (lowerTag === "<s>" || lowerTag === "<strike>") {
      strikethrough++;
      continue;
    }
    if (lowerTag === "<smallcaps>" || lowerTag === "<scap>") {
      smallcaps++;
      continue;
    }
    if (lowerTag === "<allcaps>" || lowerTag === "<uppercase>") {
      allcaps++;
      continue;
    }
    if (lowerTag === "<lowercase>") {
      lowercase++;
      continue;
    }
    if (lowerTag.startsWith("<casing=")) {
      const val = lowerTag.slice(8, -1).replace(/["']/g, "").trim();
      if (val === "upper") allcaps++;
      else if (val === "lower") lowercase++;
      continue;
    }
    if (lowerTag === "<sup>") {
      superscript++;
      continue;
    }
    if (lowerTag === "<sub>") {
      subscript++;
      continue;
    }
    if (lowerTag.startsWith("<color=")) {
      const rawVal = part.slice(7, -1).replace(/["']/g, "").trim();
      const hex = rawVal.startsWith("#") ? rawVal.slice(1) : (NAMED_COLORS[rawVal.toLowerCase()] ?? rawVal);
      colorStack.push(resolveReadableTextColor(hex));
      continue;
    }
    if (lowerTag.startsWith("<mark") && lowerTag.endsWith(">")) {
      if (lowerTag.startsWith("<mark=")) {
        const rawVal = part.slice(6, -1).replace(/["']/g, "").trim();
        const hex = rawVal.startsWith("#") ? rawVal.slice(1) : (NAMED_COLORS[rawVal.toLowerCase()] ?? rawVal);
        if (isValidHighlightColor(hex)) {
          markStack.push("#" + hex);
        } else {
          markStack.push("rgba(255, 255, 255, 0.15)");
        }
      } else {
        markStack.push("rgba(255, 255, 255, 0.15)");
      }
      continue;
    }

    // Ignore unsupported/layout tags like <size>, <align>, etc. without emitting them into text
    if (part.startsWith("<") && part.endsWith(">")) {
      continue;
    }

    // Regular text segment
    spans.push({
      text: part,
      color: colorStack[colorStack.length - 1],
      backgroundColor: markStack[markStack.length - 1],
      bold: bold > 0 ? true : undefined,
      italic: italic > 0 ? true : undefined,
      underline: underline > 0 ? true : undefined,
      strikethrough: strikethrough > 0 ? true : undefined,
      smallcaps: smallcaps > 0 ? true : undefined,
      allcaps: allcaps > 0 ? true : undefined,
      lowercase: lowercase > 0 ? true : undefined,
      superscript: superscript > 0 ? true : undefined,
      subscript: subscript > 0 ? true : undefined,
    });
  }

  return spans;
}
