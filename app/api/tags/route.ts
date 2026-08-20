import { getApplicationServices } from "@/src/infrastructure/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const { repository } = await getApplicationServices();
  return Response.json({ tags: await repository.listActiveTags() });
}
