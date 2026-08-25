import type { PresetIssue } from "@/src/domain/preset-workflow";
import { env } from "@/src/env";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import {
  answerTelegramCallbackQuery,
  deleteTelegramModerationMessage,
  editTelegramModerationDecision,
  sendTelegramReply,
} from "@/src/infrastructure/telegram";
import { escapeTelegramHtml } from "@/src/application/telegram-moderation-message";
import { constantTimeStringEqual } from "@/src/lib/crypto-utils";
import { cleanupThumbnailKeys } from "@/src/lib/thumbnail-cleanup";

type RejectionReason = "text" | "picture" | "spam";

type TelegramMessageUpdate = {
  message_id: number;
  text?: string;
  chat?: { id?: number | string };
  from?: { id?: number | string; username?: string; first_name?: string };
  reply_to_message?: { message_id?: number; text?: string; caption?: string };
};

type TelegramUpdate = {
  callback_query?: {
    id?: string;
    data?: string;
  };
  message?: TelegramMessageUpdate;
};

const rejectionIssues: Record<RejectionReason, PresetIssue> = {
  text: { source: "moderation", field: "content", code: "text_rejected", message: "Fix the preset text before submitting again." },
  picture: { source: "moderation", field: "thumbnail", code: "picture_rejected", message: "Replace or remove the picture before submitting again." },
  spam: { source: "moderation", field: "content", code: "spam", message: "Remove spam or promotional content before submitting again." },
};

const decisionLabels = {
  approve: "✅ Approved",
  text: "❌ Text",
  picture: "❌ Picture",
  spam: "❌ Spam",
} as const;

function parseDecision(data: string) {
  const approve = /^mod:approve:([0-9a-f-]{36})$/i.exec(data);
  if (approve) return { revisionId: approve[1], decision: "approve" as const };
  const reject = /^mod:reject:(text|picture|spam):([0-9a-f-]{36})$/i.exec(data);
  if (!reject) return undefined;
  return { revisionId: reject[2], decision: reject[1] as RejectionReason };
}

export async function POST(request: Request) {
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!await constantTimeStringEqual(suppliedSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let callbackQueryId: string | undefined;
  let callbackAnswer: string | undefined;

  try {
    const body = (await request.json().catch(() => null)) as TelegramUpdate | null;
    const { repository, thumbnails } = await getApplicationServices();

    const message = body?.message;
    if (message && message.text) {
      const chatId = String(message.chat?.id ?? "");
      if (env.TELEGRAM_CHAT_ID && chatId !== env.TELEGRAM_CHAT_ID) {
        return new Response("OK");
      }

      const text = message.text.trim();
      if (text.startsWith("/retract") || text.startsWith("/unpublish")) {
        const parts = text.split(/\s+/);
        let identifier: string | undefined;
        let reason: string | undefined;

        if (parts.length > 1 && !parts[1].startsWith("/")) {
          identifier = parts[1];
          reason = parts.slice(2).join(" ");
        } else if (message.reply_to_message?.message_id) {
          identifier = await repository.findPresetIdByTelegramMessageId(message.reply_to_message.message_id);
          reason = parts.slice(1).join(" ");
        }

        if (!identifier) {
          await sendTelegramReply(
            chatId,
            message.message_id,
            `ℹ️ <b>Usage:</b>\n• <code>/retract &lt;preset_link_or_slug&gt; [reason]</code>\n• Reply to a moderation notification with <code>/retract [reason]</code>`,
          );
          return new Response("OK");
        }

        const retractResult = await repository.retractPreset({
          identifier,
          reason: reason || undefined,
          suspensionDays: 7,
        });

        if (retractResult.result === "not_found") {
          await sendTelegramReply(
            chatId,
            message.message_id,
            `⚠️ Preset not found for identifier: <code>${escapeTelegramHtml(identifier)}</code>`,
          );
        } else if (retractResult.result === "not_published") {
          await sendTelegramReply(
            chatId,
            message.message_id,
            `⚠️ Preset is not currently published.`,
          );
        } else if (retractResult.result === "retracted") {
          await sendTelegramReply(
            chatId,
            message.message_id,
            `🚫 Retracted preset "<b>${escapeTelegramHtml(retractResult.title)}</b>" by <i>${escapeTelegramHtml(retractResult.authorName)}</i>.\nAuthor suspended from submitting for 7 days.`,
          );
        }

        return new Response("OK");
      }
    }

    const callback = body?.callback_query;
    callbackQueryId = callback?.id;
    const parsed = callback?.data ? parseDecision(callback.data) : undefined;
    if (!callback || !parsed) return new Response("OK");

    const context = await repository.getRevisionModerationContext(parsed.revisionId);
    if (!context) {
      callbackAnswer = "No longer available";
      return new Response("OK");
    }

    if (context.decision) {
      if (context.message) await editTelegramModerationDecision(context.message, decisionLabels[context.decision]);
      callbackAnswer = "Already reviewed";
      return new Response("OK");
    }

    if (context.status !== "pending") {
      if (context.message && await deleteTelegramModerationMessage(context.message)) {
        await repository.clearTelegramModerationMessage(parsed.revisionId, context.message.messageId);
      }
      callbackAnswer = "No longer current";
      return new Response("OK");
    }

    const moderationMessage = context.message;
    if (!moderationMessage && callbackQueryId) {
      callbackAnswer = "Try again";
      return new Response("OK");
    }

    const result = await repository.reviewPreset({
      presetId: context.presetId,
      revisionId: parsed.revisionId,
      reviewerId: null,
      decision: parsed.decision === "approve" ? "approve" : "reject",
      issues: parsed.decision === "approve" ? [] : [rejectionIssues[parsed.decision]],
    });

    if (result.result === "updated") {
      await cleanupThumbnailKeys(thumbnails, result.thumbnailKeysToDelete, "telegram review preset");
      if (moderationMessage) await editTelegramModerationDecision(moderationMessage, decisionLabels[parsed.decision]);
      callbackAnswer = parsed.decision === "approve" ? "Approved" : "Sent back to draft";
      return new Response("OK");
    }

    const current = await repository.getRevisionModerationContext(parsed.revisionId);
    if (current?.decision && current.message) {
      await editTelegramModerationDecision(current.message, decisionLabels[current.decision]);
      callbackAnswer = "Already reviewed";
    } else {
      callbackAnswer = result.result === "invalid" ? "Could not approve" : "No longer current";
    }
  } catch (error) {
    console.error(JSON.stringify({ message: "Telegram webhook failed", error: error instanceof Error ? error.message : String(error) }));
    callbackAnswer = "Review failed";
  } finally {
    if (callbackQueryId) await answerTelegramCallbackQuery(callbackQueryId, callbackAnswer);
  }

  return new Response("OK");
}
