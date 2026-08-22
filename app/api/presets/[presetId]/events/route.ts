import { getServerSession } from "next-auth";
import { z } from "zod";
import { eventDedupeBucket, eventDayBucket } from "@/src/domain/preset-events";
import { PRESET_COPY_TARGET_KEY_PATTERN } from "@/src/domain/preset-copy";
import { authOptions } from "@/src/lib/auth";
import { getPresetInteractionIdentity } from "@/src/lib/preset-identity";
import { isSameOriginMutation } from "@/src/lib/request-security";
import { getApplicationServices } from "@/src/infrastructure/runtime";

const commonEvent = {
  eventId: z.uuid(),
};

const requestSchema = z.discriminatedUnion("kind", [
  z.object({ ...commonEvent, kind: z.enum(["view", "link_open"]) }).strict(),
  z.object({
    ...commonEvent,
    kind: z.literal("copy"),
    publicationId: z.uuid(),
    targetKey: z.string().regex(PRESET_COPY_TARGET_KEY_PATTERN),
  }).strict(),
]);

export async function POST(request: Request, context: RouteContext<"/api/presets/[presetId]/events">) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2_048) return Response.json({ error: "Request is too large." }, { status: 413 });

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid interaction event." }, { status: 400 });
  }

  const { presetId } = await context.params;
  try {
    const session = await getServerSession(authOptions);
    const identity = await getPresetInteractionIdentity(request, session?.user?.id);
    const occurredAt = new Date();
    const { repository } = await getApplicationServices();
    const result = await repository.recordPresetEvent({
      presetId,
      kind: parsed.kind,
      actorHash: identity.actorHash,
      networkHash: identity.networkHash,
      isAuthenticated: identity.isAuthenticated,
      clientEventId: parsed.eventId,
      dedupeBucket: eventDedupeBucket(parsed.kind, occurredAt),
      dayBucket: eventDayBucket(occurredAt),
      copyTarget: parsed.kind === "copy" ? {
        publicationId: parsed.publicationId,
        targetKey: parsed.targetKey,
      } : undefined,
      occurredAt,
    });

    if (result.result === "not_found") return Response.json({ error: "Preset not found." }, { status: 404 });
    return Response.json({ counted: result.result === "counted", reason: result.result, statistics: result.statistics }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "preset event failed", presetId, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Interaction tracking is temporarily unavailable." }, { status: 503 });
  }
}
