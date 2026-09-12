import { env } from "@/src/env";
import { bytesToHex } from "@/src/lib/crypto-utils";

const encoder = new TextEncoder();

// Keep this derivation identical to existing event identities for historical data.
export async function analyticsHash(value: string) {
  const secret = env.ANALYTICS_HASH_SECRET ?? env.NEXTAUTH_SECRET
    ?? (process.env.NODE_ENV !== "production" ? "straftat-presets-local-only-analytics-secret" : undefined);
  if (!secret) throw new Error("NEXTAUTH_SECRET or ANALYTICS_HASH_SECRET is required for interaction hashing.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}
