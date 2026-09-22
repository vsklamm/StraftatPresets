import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/src/lib/auth";
import { isSameOriginMutation } from "@/src/lib/request-security";
import { getApplicationServices } from "@/src/infrastructure/runtime";
import { validateUserDisplayName } from "@/src/domain/user-display-name";
import { DisplayNameAlreadyUsedError } from "@/src/domain/user-profile";

export const dynamic = "force-dynamic";

const updateSchema = z.object({ displayName: z.string() }).strict();

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in to view your profile." }, { status: 401 });

  try {
    const { repository } = await getApplicationServices();
    const profile = await repository.getUserProfile(session.user.id);
    if (!profile) return Response.json({ error: "Account not found." }, { status: 404 });
    return Response.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ message: "account profile failed", error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Account is temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in to change your display name." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 1_024) return Response.json({ error: "Request is too large." }, { status: 413 });

  const body = updateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter a display name." }, { status: 400 });
  const validated = validateUserDisplayName(body.data.displayName);
  if ("error" in validated) return Response.json({ error: validated.error }, { status: 422 });

  try {
    const { repository } = await getApplicationServices();
    const profile = await repository.updateUserDisplayName(session.user.id, validated.displayName);
    if (!profile) return Response.json({ error: "Account not found." }, { status: 404 });
    return Response.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DisplayNameAlreadyUsedError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    console.error(JSON.stringify({ message: "display name update failed", error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Display name could not be saved. Try again." }, { status: 503 });
  }
}
