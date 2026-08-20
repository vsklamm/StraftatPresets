import { getServerSession } from "next-auth";
import { authOptions } from "@/src/lib/auth";
import { getPresetInteractionIdentity } from "@/src/lib/preset-identity";
import { isSameOriginMutation } from "@/src/lib/request-security";
import { getApplicationServices } from "@/src/infrastructure/runtime";

async function updateLike(request: Request, context: RouteContext<"/api/presets/[presetId]/like">, liked: boolean) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const { presetId } = await context.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return Response.json({ error: "Sign in with Discord to like presets." }, { status: 401 });

    const occurredAt = new Date();
    const identity = await getPresetInteractionIdentity(request, session.user.id);
    const { repository } = await getApplicationServices();
    const result = await repository.setPresetLike({
      presetId,
      userId: session.user.id,
      actorHash: identity.actorHash,
      liked,
      networkHash: identity.networkHash,
      dayBucket: identity.dayBucket,
      occurredAt,
    });
    if (result.result === "not_found") return Response.json({ error: "Preset not found." }, { status: 404 });
    if (result.result === "rate_limited") return Response.json({ error: "Too many like changes. Try again tomorrow.", liked: result.liked }, { status: 429 });
    return Response.json({ liked: result.liked, likes: result.statistics?.likes ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "preset like failed", presetId, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Likes are temporarily unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request, context: RouteContext<"/api/presets/[presetId]/like">) {
  return updateLike(request, context, true);
}

export async function DELETE(request: Request, context: RouteContext<"/api/presets/[presetId]/like">) {
  return updateLike(request, context, false);
}
