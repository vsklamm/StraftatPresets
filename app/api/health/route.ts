import { getApplicationServices } from "@/src/infrastructure/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { repository } = await getApplicationServices();
    await repository.ping();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
