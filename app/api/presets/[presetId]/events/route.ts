import { getServerSession } from "next-auth";
import { z } from "zod";
import { eventDedupeBucket, eventDayBucket, normalizeEventTarget, PRESET_EVENT_KINDS } from "@/src/domain/preset-events";
import { authOptions } from "@/src/lib/auth";
import { getPresetInteractionIdentity } from "@/src/lib/preset-identity";
import { isSameOriginMutation } from "@/src/lib/request-security";
import { getApplicationServices } from "@/src/infrastructure/runtime";

const requestSchema = z.object({
  eventId: z.uuid(),
  kind: z.enum(PRESET_EVENT_KINDS),
  target: z.string().max(120).optional(),
  presetVersionId: z.string().min(1).max(100).optional(),
}).strict();

export async function POST(request: Request, context: RouteContext<"/api/presets/[presetId]/events">) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2_048) return Response.json({ error: "Request is too large." }, { status: 413 });

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid interaction event." }, { status: 400 });
  }

  let target: string;
  try {
    target = normalizeEventTarget(parsed.kind, parsed.target);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid copy target." }, { status: 400 });
  }

  const { presetId } = await context.params;
  try {
    const session = await getServerSession(authOptions);
    const identity = await getPresetInteractionIdentity(request, session?.user?.id);
    const occurredAt = new Date();
    const { repository } = await getApplicationServices();
    const result = await repository.recordPresetEvent({
      presetId,
      presetVersionId: parsed.presetVersionId,
      kind: parsed.kind,
      target,
      actorHash: identity.actorHash,
      networkHash: identity.networkHash,
      isAuthenticated: identity.isAuthenticated,
      clientEventId: parsed.eventId,
      dedupeBucket: eventDedupeBucket(parsed.kind, occurredAt),
      dayBucket: eventDayBucket(occurredAt),
      occurredAt,
    });

    if (result.result === "not_found") return Response.json({ error: "Preset not found." }, { status: 404 });
    if (result.result === "invalid_version") return Response.json({ error: "Preset version does not belong to this preset." }, { status: 400 });
    return Response.json({ counted: result.result === "counted", reason: result.result, statistics: result.statistics }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "preset event failed", presetId, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Interaction tracking is temporarily unavailable." }, { status: 503 });
  }
}
