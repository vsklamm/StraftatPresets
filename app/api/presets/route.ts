import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/src/lib/auth";
import { isSameOriginMutation } from "@/src/lib/request-security";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import { PresetLimitReachedError } from "@/src/domain/preset-policy";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  view: z.enum(["popular", "newest", "mine"]).default("popular"),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const createSchema = z.object({ title: z.string().trim().min(2).max(100) }).strict();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.safeParse({
    view: url.searchParams.get("view") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!query.success) return Response.json({ error: "Invalid dashboard query." }, { status: 400 });

  try {
    const session = await getServerSession(authOptions);
    if (query.data.view === "mine" && !session?.user?.id) return Response.json({ error: "Sign in to see your presets." }, { status: 401 });
    const { repository } = await getApplicationServices();
    const result = await repository.listDashboardPresets(query.data.view, session?.user?.id, query.data.limit, query.data.offset);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "dashboard presets failed", error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Presets are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in with Discord to create a preset." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 4_096) return Response.json({ error: "Request is too large." }, { status: 413 });

  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter a preset name between 2 and 100 characters." }, { status: 400 });
  try {
    const { repository } = await getApplicationServices();
    await repository.upsertDiscordUser(session.user.id, session.user.name ?? "Discord user");
    return Response.json({ preset: await repository.createPresetDraft(session.user.id, body.data.title) }, { status: 201 });
  } catch (error) {
    if (error instanceof PresetLimitReachedError) {
      return Response.json({ error: error.message, code: error.code, limit: error.limit }, { status: 403 });
    }
    console.error(JSON.stringify({ message: "create preset failed", error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The preset could not be created." }, { status: 503 });
  }
}
