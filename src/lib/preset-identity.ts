import { cookies } from "next/headers";
import { eventDayBucket } from "@/src/domain/preset-events";
import { normalizeNetworkPrefix } from "@/src/domain/network-identity";
import { analyticsHash as hmac } from "@/src/lib/analytics-hash";

const BROWSER_COOKIE = "straftat_browser";
const BROWSER_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function requestIp(request: Request) {
  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp) return cloudflareIp;
  if (process.env.NODE_ENV === "production") return null;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function getPresetInteractionIdentity(request: Request, userId?: string) {
  const cookieStore = await cookies();
  const storedBrowserId = cookieStore.get(BROWSER_COOKIE)?.value;
  const browserId = storedBrowserId && /^[a-f0-9-]{36}$/i.test(storedBrowserId) ? storedBrowserId : crypto.randomUUID();
  if (browserId !== storedBrowserId) {
    cookieStore.set(BROWSER_COOKIE, browserId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: BROWSER_COOKIE_MAX_AGE_SECONDS,
      priority: "medium",
    });
  }

  const dayBucket = eventDayBucket();
  const networkPrefix = normalizeNetworkPrefix(requestIp(request));
  return {
    actorHash: await hmac(userId ? `user:${userId}` : `browser:${browserId}`),
    networkHash: networkPrefix ? await hmac(`network:${dayBucket}:${networkPrefix}`) : undefined,
    isAuthenticated: Boolean(userId),
    dayBucket,
  };
}
