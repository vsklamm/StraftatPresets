import assert from "node:assert/strict";
import test from "node:test";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { securityConfig } from "../src/lib/security-config";

function response(url: string, protocol: string, development = false) {
  return unstable_getResponseFromNextConfig({
    url,
    headers: { host: new URL(url).host, "x-forwarded-proto": protocol },
    nextConfig: securityConfig(development),
  });
}

test("transport redirects belong to Cloudflare, not forwarded protocol headers", async () => {
  for (const path of ["/", "/p/example?tab=versions", "/api/presets"]) {
    const result = await response(`http://straftatpresets.com${path}`, "http");
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("location"), null);
    const https = await response(`https://straftatpresets.com${path}`, "http");
    assert.equal(https.headers.get("location"), null);
  }
});

test("HTTPS does not loop and unrelated hosts cannot redirect to production", async () => {
  for (const [url, protocol] of [
    ["https://straftatpresets.com/", "https"],
    ["http://localhost:3000/", "http"],
    ["http://straftatpresetsXcom/", "http"],
    ["http://straftatpresets.com.attacker.example/", "http"],
  ]) {
    assert.equal((await response(url, protocol)).headers.get("location"), null);
  }
});

test("production CSP restricts resources without breaking hydration, styles, or image previews", async () => {
  const result = await response("https://straftatpresets.com/", "https");
  const policy = result.headers.get("content-security-policy")!;
  for (const directive of [
    "default-src 'self'", "script-src 'self' 'unsafe-inline'", "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:",
    "connect-src 'self'", "object-src 'none'", "base-uri 'none'",
    "frame-ancestors 'none'", "form-action 'self' https://discord.com", "upgrade-insecure-requests",
  ]) assert.ok(policy.split("; ").includes(directive), directive);
  assert.ok(!policy.includes("unsafe-eval"));
  assert.ok(!policy.includes("ws:"));
  assert.equal(result.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.equal(result.headers.get("x-frame-options"), "DENY");
});

test("local development and production previews keep HTTP available", async () => {
  for (const development of [true, false]) {
    const result = await response("http://localhost:3000/", "http", development);
    const policy = result.headers.get("content-security-policy")!;
    assert.equal(result.headers.get("strict-transport-security"), null);
    assert.ok(!policy.includes("upgrade-insecure-requests"));
    assert.equal(policy.includes("unsafe-eval"), development);
    assert.equal(policy.includes(" ws: wss:"), development);
  }
});

test("weapon caching and security headers coexist on application-served assets", async () => {
  const result = await response("https://straftatpresets.com/weapons/example.webp", "https");
  assert.equal(result.headers.get("cache-control"), "public, max-age=7776000, immutable");
  assert.ok(result.headers.has("content-security-policy"));
});
