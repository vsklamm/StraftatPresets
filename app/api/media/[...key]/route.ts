import { getApplicationServices } from "@/src/infrastructure/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const objectKey = key.join("/");
  if (!objectKey.startsWith("presets/") || objectKey.includes("..")) return new Response("Not found", { status: 404 });

  try {
    const { thumbnails } = await getApplicationServices();
    const object = await thumbnails.get(objectKey);
    if (!object) return new Response("Not found", { status: 404 });

    if (request.headers.get("if-none-match") === object.etag) return new Response(null, { status: 304 });
    return new Response(object.body, {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": object.cacheControl ?? "private, max-age=3600",
        ETag: object.etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to retrieve thumbnail from R2 storage:", error);
    return new Response("Not found", { status: 404 });
  }
}
