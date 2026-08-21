import { getServerSession } from "next-auth";
import { z } from "zod";
import { presetRevisionContentSchema } from "@/src/domain/preset-content";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import { authOptions } from "@/src/lib/auth";
import { isSameOriginMutation } from "@/src/lib/request-security";
import { cleanupThumbnailKeys } from "@/src/lib/thumbnail-cleanup";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  revisionId: z.string().uuid(),
  editVersion: z.number().int().min(0),
  content: presetRevisionContentSchema,
}).strict();

export async function GET(_request: Request, context: RouteContext<"/api/presets/[presetId]">) {
  const { presetId } = await context.params;
  try {
    const session = await getServerSession(authOptions);
    const { repository } = await getApplicationServices();
    const preset = await repository.getPresetForViewer(presetId, session?.user?.id);
    if (!preset) return Response.json({ error: "Preset not found." }, { status: 404 });
    return Response.json({ preset }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "read preset failed", presetId, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The preset is temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/presets/[presetId]">) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in with Discord to edit a preset." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) return Response.json({ error: "Request is too large." }, { status: 413 });
  const body = updateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Preset content is invalid.", details: body.error.issues }, { status: 400 });

  const { presetId } = await context.params;
  try {
    const { repository, thumbnails } = await getApplicationServices();
    const result = await repository.savePresetDraft({ presetId, userId: session.user.id, ...body.data });
    if (result.result === "not_found") return Response.json({ error: "Preset not found." }, { status: 404 });
    if (result.result === "forbidden") return Response.json({ error: "You can only edit your own preset." }, { status: 403 });
    if (result.result === "conflict") return Response.json({ error: "This preset changed elsewhere. Reload it before editing." }, { status: 409 });
    if (result.result === "invalid") return Response.json({ error: "Preset content is invalid.", issues: result.issues }, { status: 422 });
    await cleanupThumbnailKeys(thumbnails, result.thumbnailKeysToDelete, "save preset draft");
    return Response.json({ preset: result.preset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "save preset failed", presetId, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The preset could not be saved." }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/presets/[presetId]">) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in with Discord to delete a preset." }, { status: 401 });

  const { presetId } = await context.params;
  try {
    const { repository, thumbnails } = await getApplicationServices();

    // Verify ownership and discover the thumbnail key before any destructive work.
    const target = await repository.findThumbnailTarget(presetId);
    if (!target) return Response.json({ error: "Preset not found." }, { status: 404 });
    if (target.authorId !== session.user.id) return Response.json({ error: "You can only delete your own preset." }, { status: 403 });

    // Delete both the working and published objects first. They can differ
    // while an edited published preset is still under review.
    for (const key of new Set([target.thumbnailKey, target.publishedThumbnailKey].filter((value): value is string => Boolean(value)))) {
      await thumbnails.delete(key);
    }

    // Now delete the DB row. CASCADE handles events, revisions, and stats.
    // The WHERE includes authorId so even a concurrent race cannot delete
    // another user's preset.
    const result = await repository.deletePreset(presetId, session.user.id);
    if (result.result === "not_found") return Response.json({ error: "Preset not found." }, { status: 404 });
    if (result.result === "forbidden") return Response.json({ error: "You can only delete your own preset." }, { status: 403 });

    return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "delete preset failed", presetId, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The preset could not be deleted." }, { status: 503 });
  }
}
