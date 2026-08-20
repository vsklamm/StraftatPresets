import { getServerSession } from "next-auth";
import { authOptions } from "@/src/lib/auth";
import { prepareThumbnail } from "@/src/lib/image-moderation";
import { MAX_THUMBNAIL_REQUEST_BYTES } from "@/src/domain/thumbnail-policy";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import { isSameOriginMutation } from "@/src/lib/request-security";

export async function POST(request: Request, context: RouteContext<"/api/presets/[presetId]/thumbnail">) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in with Discord to upload a pic." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_THUMBNAIL_REQUEST_BYTES) return Response.json({ error: "Upload is too large." }, { status: 413 });

  const { presetId } = await context.params;
  const { repository, thumbnails, thumbnailProcessor } = await getApplicationServices();
  const preset = await repository.findThumbnailTarget(presetId);
  if (!preset) return Response.json({ error: "Preset not found." }, { status: 404 });
  if (preset.authorId !== session.user.id) return Response.json({ error: "You can only edit your own preset." }, { status: 403 });

  try {
    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) return Response.json({ error: "Add an image using the 'image' field." }, { status: 400 });

    const prepared = await prepareThumbnail(image, thumbnailProcessor);

    // Uploaded thumbnails enter the manual Telegram review queue.
    const moderatedAt = new Date();
    const moderationData = JSON.stringify({
      provider: "manual_telegram_review",
      sha256: prepared.sha256,
    });

    const uploaded = await thumbnails.put(presetId, prepared);
    try {
      await repository.updateThumbnailKeyAndStatus(presetId, uploaded.key, { status: "needs_review", data: moderationData, moderatedAt });
    } catch (error) {
      await thumbnails.delete(uploaded.key);
      throw error;
    }

    if (preset.thumbnailKey && preset.thumbnailKey !== preset.publishedThumbnailKey) {
      await thumbnails.delete(preset.thumbnailKey).catch((error) => console.error("Old thumbnail cleanup failed", error));
    }

    return Response.json({ key: uploaded.key, url: uploaded.url, decision: "needs_review" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pic processing failed.";
    const isInputError = /Upload|Thumbnail|Pic|JPEG|PNG|pixels/i.test(message);
    if (!isInputError) console.error("Pic moderation failed", error);
    return Response.json({ error: isInputError ? message : "Pic review is temporarily unavailable." }, { status: isInputError ? 400 : 503 });
  }
}
