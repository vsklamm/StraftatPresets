import type { PresetRevisionContent } from "@/src/domain/preset-content";
import {
  extractModeratableFields,
  getChangedModeratableFields,
} from "@/src/lib/moderation";
import { stripColorAndFormattingTags } from "@/src/domain/straftat-markup";
import type { ModeratableField } from "@/src/lib/moderation/types";

export const TELEGRAM_TEXT_LIMIT = 4_096;
export const TELEGRAM_PHOTO_CAPTION_LIMIT = 1_024;
const DECISION_RESERVE = 48;

type MessageBlock = { text: string; bold?: boolean; italic?: boolean };

function normalizeTelegramText(value: string) {
  return stripColorAndFormattingTags(value)
    .replace(/\r\n|[\r\u2028\u2029\u000B\u000C\u0085]/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

export function escapeTelegramHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function truncateText(value: string, maximum: number) {
  const characters = Array.from(value);
  if (characters.length <= maximum) return value;
  if (maximum <= 1) return maximum === 1 ? "…" : "";
  return `${characters.slice(0, maximum - 1).join("")}…`;
}

function uniqueFieldValues(fields: readonly ModeratableField[], predicate: (field: ModeratableField) => boolean) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const field of fields) {
    if (!predicate(field)) continue;
    const value = normalizeTelegramText(field.cleanText);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function renderBlocks(blocks: readonly MessageBlock[], maximum: number) {
  const visibleParts: string[] = [];
  const htmlParts: string[] = [];
  let visibleLength = 0;

  for (const block of blocks) {
    const text = normalizeTelegramText(block.text);
    if (!text) continue;
    const separatorLength = visibleParts.length ? 2 : 0;
    const available = maximum - visibleLength - separatorLength;
    if (available <= 0) break;
    const renderedText = truncateText(text, available);
    visibleParts.push(renderedText);
    const escaped = escapeTelegramHtml(renderedText);
    htmlParts.push(block.bold ? `<b>${escaped}</b>` : block.italic ? `<i>${escaped}</i>` : escaped);
    visibleLength += separatorLength + Array.from(renderedText).length;
    if (renderedText !== text) break;
  }

  return {
    html: htmlParts.join("\n\n"),
    text: visibleParts.join("\n\n"),
    length: visibleLength,
  };
}

function isMapName(field: ModeratableField) {
  return field.label === "Map Playlist Name";
}

function isMapDescription(field: ModeratableField) {
  return field.label === "Map Playlist Description";
}

function isSwapperName(field: ModeratableField) {
  return field.label === "Swapper Name";
}

function isSwapperDescription(field: ModeratableField) {
  return field.label === "Swapper Description";
}

export function buildTelegramModerationMessage(input: {
  authorName?: string;
  content: PresetRevisionContent;
  previousContent?: PresetRevisionContent | null;
  requiresTextReview: boolean;
  hasThumbnail: boolean;
}) {
  const previousContent = input.previousContent ?? null;
  const changedFields = previousContent
    ? getChangedModeratableFields(previousContent, input.content)
    : extractModeratableFields(input.content);
  const descriptionChanged = !previousContent || changedFields.some((field) => field.path === "description");
  const blocks: MessageBlock[] = [
    { text: previousContent ? "✏️ Edit" : "🆕 New", bold: true },
    { text: input.content.title, bold: true },
  ];

  if (input.authorName) {
    blocks.push({ text: `by ${input.authorName}`, italic: true });
  }

  if (descriptionChanged) blocks.push({ text: input.content.description });

  if (input.requiresTextReview) {
    blocks.push(
      ...uniqueFieldValues(changedFields, isSwapperName).map((text) => ({ text, bold: true })),
      ...uniqueFieldValues(changedFields, isSwapperDescription).map((text) => ({ text })),
      ...uniqueFieldValues(changedFields, isMapName).map((text) => ({ text, bold: true })),
      ...uniqueFieldValues(changedFields, isMapDescription).map((text) => ({ text })),
    );
  }

  const telegramLimit = input.hasThumbnail ? TELEGRAM_PHOTO_CAPTION_LIMIT : TELEGRAM_TEXT_LIMIT;
  return {
    ...renderBlocks(blocks, telegramLimit - DECISION_RESERVE),
    limit: telegramLimit,
  };
}

export function appendTelegramDecision(messageHtml: string, decision: string, limit: number) {
  const decisionHtml = `<b>${escapeTelegramHtml(decision)}</b>`;
  const result = `${messageHtml}\n\n${decisionHtml}`;
  if (Array.from(stripTelegramHtml(result)).length > limit) throw new Error("Telegram moderation message exceeds its limit.");
  return result;
}

function stripTelegramHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
