import { cookies } from "next/headers";
import { eventDayBucket } from "@/src/domain/preset-events";
import { normalizeNetworkPrefix } from "@/src/domain/network-identity";
import { env } from "@/src/env";
import { bytesToHex } from "@/src/lib/crypto-utils";

const BROWSER_COOKIE = "straftat_browser";
const BROWSER_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const encoder = new TextEncoder();

function analyticsSecret() {
  const secret = env.ANALYTICS_HASH_SECRET ?? env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "straftat-presets-local-only-analytics-secret";
  throw new Error("NEXTAUTH_SECRET or ANALYTICS_HASH_SECRET is required for interaction hashing.");
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(analyticsSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return bytesToHex(signature);
}

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
