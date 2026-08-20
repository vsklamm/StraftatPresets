import { z } from "zod";
import { getApplicationServices } from "@/src/infrastructure/runtime";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.safeParse({ limit: url.searchParams.get("limit") ?? undefined, offset: url.searchParams.get("offset") ?? undefined });
  if (!query.success) return Response.json({ error: "Invalid pagination." }, { status: 400 });
  try {
    const { repository } = await getApplicationServices();
    const result = await repository.listRankedPresetOrder(query.data.limit, query.data.offset);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "preset order failed", error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Preset ordering is temporarily unavailable." }, { status: 503 });
  }
}
