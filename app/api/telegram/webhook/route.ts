import type { PresetIssue } from "@/src/domain/preset-workflow";
import { env } from "@/src/env";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import {
  answerTelegramCallbackQuery,
  deleteTelegramModerationMessage,
  editTelegramModerationDecision,
} from "@/src/infrastructure/telegram";
import { constantTimeStringEqual } from "@/src/lib/crypto-utils";
import { cleanupThumbnailKeys } from "@/src/lib/thumbnail-cleanup";

type RejectionReason = "text" | "picture" | "spam";

type TelegramUpdate = {
  callback_query?: {
    id?: string;
    data?: string;
  };
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
    const callback = body?.callback_query;
    callbackQueryId = callback?.id;
    const parsed = callback?.data ? parseDecision(callback.data) : undefined;
    if (!callback || !parsed) return new Response("OK");

    const { repository, thumbnails } = await getApplicationServices();
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
