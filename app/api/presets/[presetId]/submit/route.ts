import { getServerSession } from "next-auth";
import { z } from "zod";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import { authOptions } from "@/src/lib/auth";
import { isSameOriginMutation } from "@/src/lib/request-security";
import { cleanupThumbnailKeys } from "@/src/lib/thumbnail-cleanup";

const submitSchema = z.object({
  revisionId: z.string().uuid(),
  editVersion: z.number().int().min(0),
}).strict();

export async function POST(request: Request, context: RouteContext<"/api/presets/[presetId]/submit">) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in with Discord to submit a preset." }, { status: 401 });
  const body = submitSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid submit request." }, { status: 400 });

  const { presetId } = await context.params;
  try {
    const { repository, thumbnails } = await getApplicationServices();
    const result = await repository.submitPreset({ presetId, userId: session.user.id, ...body.data });
    if (result.result === "not_found") return Response.json({ error: "Preset not found." }, { status: 404 });
    if (result.result === "forbidden") return Response.json({ error: "You can only submit your own preset." }, { status: 403 });
    if (result.result === "conflict") return Response.json({ error: "This draft changed. Reload it before submitting." }, { status: 409 });
    if (result.result === "no_changes") return Response.json({ error: result.message, code: "no_changes" }, { status: 400 });
    if (result.result === "rate_limited") {
      const headers: Record<string, string> = { "Cache-Control": "no-store" };
      if (result.retryAfterSeconds) headers["Retry-After"] = String(result.retryAfterSeconds);
      return Response.json({ error: result.message, code: "submission_rate_limited", retryAfterSeconds: result.retryAfterSeconds }, { status: 429, headers });
    }
    if (result.result === "invalid") return Response.json({ error: "Finish the required fields before submitting.", issues: result.issues }, { status: 422 });
    await cleanupThumbnailKeys(thumbnails, result.thumbnailKeysToDelete, "submit preset");
    return Response.json({ preset: result.preset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "submit preset failed", presetId, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The preset could not be submitted." }, { status: 503 });
  }
}
