import { getServerSession } from "next-auth";
import { z } from "zod";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import { authOptions } from "@/src/lib/auth";
import { isSameOriginMutation } from "@/src/lib/request-security";
import { cleanupThumbnailKeys } from "@/src/lib/thumbnail-cleanup";

const moderationIssueSchema = z.object({
  source: z.literal("moderation"),
  field: z.string().min(1).max(200),
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
}).strict();

const reviewSchema = z.object({
  revisionId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  issues: z.array(moderationIssueSchema).max(30).default([]),
}).strict().refine((body) => body.decision !== "reject" || body.issues.length > 0, { message: "A rejection reason is required.", path: ["issues"] });

export async function POST(request: Request, context: RouteContext<"/api/admin/presets/[presetId]/review">) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in to review presets." }, { status: 401 });
  const body = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid review request.", details: body.error.issues }, { status: 400 });

  const { presetId } = await context.params;
  try {
    const { repository, thumbnails } = await getApplicationServices();
    const role = await repository.getUserRole(session.user.id);
    if (role !== "moderator" && role !== "admin") return Response.json({ error: "Moderator access required." }, { status: 403 });
    const result = await repository.reviewPreset({ presetId, reviewerId: session.user.id, ...body.data });
    if (result.result === "not_found") return Response.json({ error: "Preset not found." }, { status: 404 });
    if (result.result === "conflict") return Response.json({ error: "This review is no longer current." }, { status: 409 });
    if (result.result === "invalid") return Response.json({ error: "The preset cannot be approved.", issues: result.issues }, { status: 422 });
    await cleanupThumbnailKeys(thumbnails, result.thumbnailKeysToDelete, "review preset");
    return Response.json({ preset: result.preset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "review preset failed", presetId, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The review could not be completed." }, { status: 503 });
  }
}
