import type { TelegramModerationMessage } from "@/src/application/ports";
import {
  appendTelegramDecision,
  buildTelegramModerationMessage,
  TELEGRAM_PHOTO_CAPTION_LIMIT,
  TELEGRAM_TEXT_LIMIT,
} from "@/src/application/telegram-moderation-message";
import type { PresetRevisionContent } from "@/src/domain/preset-content";
import { env } from "@/src/env";

type TelegramKeyboard = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

type TelegramSendResult = {
  ok?: boolean;
  result?: {
    message_id?: number;
    chat?: { id?: number | string };
  };
};

const moderationKeyboard = (revisionId: string): TelegramKeyboard => ({
  inline_keyboard: [
    [{ text: "✅ Approve", callback_data: `mod:approve:${revisionId}` }],
    [
      { text: "❌ Text", callback_data: `mod:reject:text:${revisionId}` },
      { text: "❌ Picture", callback_data: `mod:reject:picture:${revisionId}` },
      { text: "❌ Spam", callback_data: `mod:reject:spam:${revisionId}` },
    ],
  ],
});

function telegramUrl(method: string) {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

async function logTelegramFailure(operation: string, response: Response) {
  const details = (await response.text().catch(() => "")).slice(0, 1_000);
  console.error(JSON.stringify({ message: `Telegram ${operation} failed`, status: response.status, details }));
}

async function parseSentMessage(
  response: Response,
  revisionId: string,
  kind: "text" | "photo",
  html: string,
): Promise<TelegramModerationMessage | undefined> {
  if (!response.ok) {
    await logTelegramFailure(kind === "photo" ? "sendPhoto" : "sendMessage", response);
    return undefined;
  }
  const payload = await response.json() as TelegramSendResult;
  const messageId = payload.result?.message_id;
  const chatId = payload.result?.chat?.id;
  if (!payload.ok || typeof messageId !== "number" || chatId === undefined) {
    console.error(JSON.stringify({ message: "Telegram returned an invalid moderation message response" }));
    return undefined;
  }
  return { revisionId, chatId: String(chatId), messageId, kind, html, resolvedAt: null };
}

function absoluteThumbnailUrl(imageUrl: string) {
  if (!imageUrl.startsWith("/")) return imageUrl;
  const base = env.NEXTAUTH_URL && !env.NEXTAUTH_URL.includes("localhost")
    ? env.NEXTAUTH_URL.replace(/\/$/, "")
    : "http://127.0.0.1:3000";
  return `${base}${imageUrl}`;
}

async function sendPhoto(
  revisionId: string,
  imageUrl: string,
  html: string,
  keyboard: TelegramKeyboard,
): Promise<TelegramModerationMessage | undefined> {
  const absoluteUrl = absoluteThumbnailUrl(imageUrl);
  try {
    const imageResponse = await fetch(absoluteUrl);
    if (imageResponse.ok) {
      const formData = new FormData();
      formData.append("chat_id", env.TELEGRAM_CHAT_ID!);
      formData.append("photo", await imageResponse.blob(), "thumbnail.webp");
      formData.append("caption", html);
      formData.append("parse_mode", "HTML");
      formData.append("reply_markup", JSON.stringify(keyboard));
      return parseSentMessage(await fetch(telegramUrl("sendPhoto"), { method: "POST", body: formData }), revisionId, "photo", html);
    }
  } catch (error) {
    console.error(JSON.stringify({ message: "Telegram thumbnail fetch failed", error: error instanceof Error ? error.message : String(error) }));
  }

  if (!absoluteUrl.startsWith("https://")) return undefined;
  const response = await fetch(telegramUrl("sendPhoto"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      photo: absoluteUrl,
      caption: html,
      parse_mode: "HTML",
      reply_markup: keyboard,
    }),
  });
  return parseSentMessage(response, revisionId, "photo", html);
}

export async function notifyModeratorOfPendingPreset(input: {
  revisionId: string;
  content: PresetRevisionContent;
  previousContent?: PresetRevisionContent | null;
  requiresTextReview: boolean;
  thumbnailUrl?: string;
}): Promise<TelegramModerationMessage | undefined> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("Telegram moderation not configured. Skipping notification.");
    return undefined;
  }

  const message = buildTelegramModerationMessage({
    content: input.content,
    previousContent: input.previousContent,
    requiresTextReview: input.requiresTextReview,
    hasThumbnail: Boolean(input.thumbnailUrl),
  });
  const keyboard = moderationKeyboard(input.revisionId);

  if (input.thumbnailUrl) {
    const sentPhoto = await sendPhoto(input.revisionId, input.thumbnailUrl, message.html, keyboard);
    if (sentPhoto) return sentPhoto;
  }

  const response = await fetch(telegramUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message.html,
      parse_mode: "HTML",
      reply_markup: keyboard,
    }),
  });
  return parseSentMessage(response, input.revisionId, "text", message.html);
}

export async function editTelegramModerationDecision(message: TelegramModerationMessage, decision: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const limit = message.kind === "photo" ? TELEGRAM_PHOTO_CAPTION_LIMIT : TELEGRAM_TEXT_LIMIT;
  const content = appendTelegramDecision(message.html, decision, limit);
  const method = message.kind === "photo" ? "editMessageCaption" : "editMessageText";
  const body = message.kind === "photo"
    ? { chat_id: message.chatId, message_id: message.messageId, caption: content, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }
    : { chat_id: message.chatId, message_id: message.messageId, text: content, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } };
  const response = await fetch(telegramUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const details = (await response.text().catch(() => "")).slice(0, 1_000);
    if (response.status === 400 && details.includes("message is not modified")) return true;
    console.error(JSON.stringify({ message: `Telegram ${method} failed`, status: response.status, details }));
    return false;
  }
  return true;
}

export async function deleteTelegramModerationMessage(message: TelegramModerationMessage) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const response = await fetch(telegramUrl("deleteMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: message.chatId, message_id: message.messageId }),
  });
  if (!response.ok) {
    await logTelegramFailure("deleteMessage", response);
    return false;
  }
  return true;
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const response = await fetch(telegramUrl("answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  });
  if (!response.ok) await logTelegramFailure("answerCallbackQuery", response);
}
