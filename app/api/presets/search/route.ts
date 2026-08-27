import { getServerSession } from "next-auth";
import { z } from "zod";
import { getWeaponGameId } from "@/src/domain/game-catalog";
import { MAX_SEARCH_QUERY_CHARACTERS, MAX_SEARCH_SEGMENTS } from "@/src/domain/preset-search";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import { authOptions } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().max(MAX_SEARCH_QUERY_CHARACTERS).default(""),
  tags: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(MAX_SEARCH_SEGMENTS).default([]),
  weapons: z.array(z.string().min(1).max(120)).max(MAX_SEARCH_SEGMENTS).default([]),
  view: z.enum(["popular", "updated", "mine"]).default("popular"),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

function commaList(value: string | null) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    tags: commaList(url.searchParams.get("tags")),
    weapons: commaList(url.searchParams.get("weapons")),
    view: url.searchParams.get("view") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: "Invalid preset search." }, { status: 400 });

  const session = await getServerSession(authOptions);
  if (parsed.data.view === "mine" && !session?.user?.id) {
    return Response.json({ error: "Sign in to search your published presets." }, { status: 401 });
  }

  const weaponGameIds = parsed.data.weapons.map(getWeaponGameId).filter((value): value is string => value !== null);
  if (weaponGameIds.length !== parsed.data.weapons.length) {
    return Response.json({ error: "Search contains an unsupported weapon." }, { status: 400 });
  }
  if (!parsed.data.q.trim() && !parsed.data.tags.length && !weaponGameIds.length) {
    return Response.json({ items: [], total: 0 }, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const { repository } = await getApplicationServices();
    const result = await repository.searchPublishedPresets({
      query: parsed.data.q,
      tagSlugs: [...new Set(parsed.data.tags)],
      weaponGameIds: [...new Set(weaponGameIds)],
      authorId: parsed.data.view === "mine" ? session!.user!.id : undefined,
      order: parsed.data.view === "popular" ? "popular" : "updated",
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    }, session?.user?.id);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "preset search failed", error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Preset search is temporarily unavailable." }, { status: 503 });
  }
}
