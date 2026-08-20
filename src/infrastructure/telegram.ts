import { env } from "@/src/env";
import type { PresetRevisionContent } from "@/src/domain/preset-workflow";

type TelegramKeyboard = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

async function sendTelegramPhoto(
  chatId: string | number,
  imageUrl: string,
  caption: string,
  replyMarkup?: TelegramKeyboard,
): Promise<Response | undefined> {
  if (!env.TELEGRAM_BOT_TOKEN) return undefined;

  let absoluteUrl = imageUrl;
  if (imageUrl.startsWith("/")) {
    const base = env.NEXTAUTH_URL && !env.NEXTAUTH_URL.includes("localhost")
      ? env.NEXTAUTH_URL.replace(/\/$/, "")
      : "http://127.0.0.1:3000";
    absoluteUrl = `${base}${imageUrl}`;
  }

  try {
    const res = await fetch(absoluteUrl);
    if (res.ok) {
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("chat_id", chatId.toString());
      formData.append("photo", blob, "thumbnail.webp");
      formData.append("caption", caption.substring(0, 1024));
      formData.append("parse_mode", "Markdown");
      if (replyMarkup) formData.append("reply_markup", JSON.stringify(replyMarkup));

      return await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        body: formData,
      });
    }
  } catch (e) {
    console.error("Failed to fetch image for Telegram sendPhoto:", e);
  }

  if (absoluteUrl.startsWith("https://")) {
    try {
      return await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: absoluteUrl,
          caption: caption.substring(0, 1024),
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        }),
      });
    } catch (e) {
      console.error("Failed to send remote photo URL to Telegram:", e);
    }
  }

  return undefined;
}

export async function notifyModeratorOfPendingPreset(presetId: string, revisionId: string, content: PresetRevisionContent, thumbnailUrl?: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("Telegram moderation not configured. Skipping notification.");
    return;
  }

  const mapPlaylistsText = content.versions.flatMap((v) => v.mapPlaylists.map((p) => `• *${p.name}*: ${p.description || "_No description_"}`)).join("\n");
  const text = `🚨 *New Preset Pending Review*\n\n*Title:* ${content.title}\n*Description:* ${content.description}\n\n*Map Playlists:*\n${mapPlaylistsText || "_None_"}\n\n*Preset ID:* ${presetId}\n*Revision:* ${revisionId}`;

  const keyboard: TelegramKeyboard = {
    inline_keyboard: [
      [{ text: "✅ Approve", callback_data: `mod:approve:${revisionId}` }],
      [
        { text: "❌ Reject (Profanity)", callback_data: `mod:reject:profanity:${revisionId}` },
        { text: "❌ Reject (Quality)", callback_data: `mod:reject:quality:${revisionId}` },
      ],
      [
        { text: "❌ Reject (Spam)", callback_data: `mod:reject:spam:${revisionId}` },
      ],
    ],
  };

  try {
    let sent = false;
    if (thumbnailUrl) {
      const photoResponse = await sendTelegramPhoto(env.TELEGRAM_CHAT_ID, thumbnailUrl, text, keyboard);
      if (photoResponse && photoResponse.ok) {
        sent = true;
      } else {
        console.warn("Telegram sendPhoto was unsuccessful, falling back to text notification.");
      }
    }

    if (!sent) {
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }),
      });

      if (!response.ok) {
        console.error("Failed to send Telegram notification:", await response.text());
      }
    }
  } catch (error) {
    console.error("Error sending Telegram notification:", error);
  }
}

export async function editTelegramMessage(chatId: number | string, messageId: number, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] },
      }),
    });

    if (!response.ok) {
      console.error("Failed to edit Telegram message:", await response.text());
    }
  } catch (error) {
    console.error("Error editing Telegram message:", error);
  }
}
