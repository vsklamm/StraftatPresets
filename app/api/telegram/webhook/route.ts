import { env } from "@/src/env";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import { cleanupThumbnailKeys } from "@/src/lib/thumbnail-cleanup";
import { editTelegramMessage } from "@/src/infrastructure/telegram";
import type { PresetIssue } from "@/src/domain/preset-workflow";

type TelegramUpdate = {
  callback_query?: {
    data?: string;
    message?: {
      chat: { id: number | string };
      message_id: number;
      text: string;
    };
    from?: {
      id?: number | string;
      username?: string;
    };
  };
};

export async function POST(request: Request) {
  // Verify secret token if configured
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const body = (await request.json().catch(() => null)) as TelegramUpdate | null;
    if (!body || !body.callback_query) {
      return new Response("OK"); // Acknowledge to Telegram to stop retries
    }

    const { callback_query } = body;
    const { data, message, from } = callback_query;

    if (!data || !message) {
      return new Response("OK");
    }

    const moderatorName = from?.username ? `@${from.username}` : `User ${from?.id || 'Unknown'}`;

    // Expected data format: mod:approve:presetId:revisionId or mod:reject:reason:presetId:revisionId
    const parts = data.split(":");
    if (parts[0] !== "mod") {
      return new Response("OK");
    }

    const { repository, thumbnails } = await getApplicationServices();

    if (parts[1] === "approve") {
      const revisionId = parts[2];
      const presetId = await repository.getPresetIdForRevision(revisionId);

      if (!presetId) {
        await editTelegramMessage(message.chat.id, message.message_id, `${message.text}\n\n⚠️ *Failed to approve. Preset not found.*`);
        return new Response("OK");
      }

      const result = await repository.reviewPreset({
        presetId,
        revisionId,
        reviewerId: null,
        decision: "approve",
        issues: []
      });

      if (result.result === "updated") {
        await cleanupThumbnailKeys(thumbnails, result.thumbnailKeysToDelete, "telegram approve preset");
        await editTelegramMessage(message.chat.id, message.message_id, `${message.text}\n\n✅ *Approved by ${moderatorName}*`);
      } else {
        await editTelegramMessage(message.chat.id, message.message_id, `${message.text}\n\n⚠️ *Failed to approve. Preset might have changed.*`);
      }
    } else if (parts[1] === "reject") {
      const reasonCode = parts[2];
      const revisionId = parts[3];
      const presetId = await repository.getPresetIdForRevision(revisionId);

      if (!presetId) {
        await editTelegramMessage(message.chat.id, message.message_id, `${message.text}\n\n⚠️ *Failed to reject. Preset not found.*`);
        return new Response("OK");
      }

      let reasonText = "Rejected";
      const issues: PresetIssue[] = [];

      if (reasonCode === "profanity") {
        reasonText = "Rejected (Profanity)";
        issues.push({ source: "moderation", field: "content", code: "profanity", message: "Preset contains inappropriate language." });
      } else if (reasonCode === "quality") {
        reasonText = "Rejected (Low Quality)";
        issues.push({ source: "moderation", field: "content", code: "low_quality", message: "Preset description does not meet quality standards." });
      } else if (reasonCode === "spam") {
        reasonText = "Rejected (Spam)";
        issues.push({ source: "moderation", field: "content", code: "spam", message: "Preset flagged as spam." });
      }

      const result = await repository.reviewPreset({
        presetId,
        revisionId,
        reviewerId: null,
        decision: "reject",
        issues
      });

      if (result.result === "updated") {
        await editTelegramMessage(message.chat.id, message.message_id, `${message.text}\n\n❌ *${reasonText} by ${moderatorName}*`);
      } else {
        await editTelegramMessage(message.chat.id, message.message_id, `${message.text}\n\n⚠️ *Failed to reject. Preset might have changed.*`);
      }
    }

    return new Response("OK");
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return new Response("OK"); // Always return OK so Telegram doesn't keep retrying and blocking the queue
  }
}
