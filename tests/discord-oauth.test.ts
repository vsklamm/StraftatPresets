import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { custom, Issuer } from "openid-client";
import type { OAuthConfig } from "next-auth/providers/oauth";
import type { NextAuthOptions } from "next-auth";

const { authOptions } = createRequire(import.meta.url)("../src/lib/auth.ts") as { authOptions: NextAuthOptions };

test("Discord token exchange tolerates a response slower than the default timeout", async () => {
  const provider = authOptions.providers[0] as OAuthConfig<unknown>;
  const issuer = provider.options?.issuer;
  assert.ok(issuer, "Discord issuer must be configured");
  const server = createServer((_request, response) => {
    const timer = setTimeout(() => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ access_token: "fixture-token", token_type: "Bearer" }));
    }, 4_000);
    response.on("close", () => clearTimeout(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const client = new (new Issuer({
      issuer,
      token_endpoint: `http://127.0.0.1:${address.port}/token`,
    })).Client({ client_id: "fixture-client", client_secret: "fixture-secret" });
    client[custom.http_options] = () => provider.options?.httpOptions ?? {};
    const tokens = await client.oauthCallback("http://localhost:3000/api/auth/callback/discord", {
      code: "fixture-code", state: "fixture-state", iss: "https://discord.com",
    }, { state: "fixture-state" });
    assert.equal(tokens.access_token, "fixture-token");
    assert.equal(provider.options?.httpOptions?.timeout, 10_000);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Discord callbacks accept the published issuer and still reject issuer and state mismatches", async () => {
  const provider = authOptions.providers[0] as OAuthConfig<unknown>;
  const issuer = provider.options?.issuer;
  assert.ok(issuer, "Discord issuer must be configured");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ access_token: "fixture-token", token_type: "Bearer" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const client = new (new Issuer({
      issuer,
      token_endpoint: `http://127.0.0.1:${address.port}/token`,
    })).Client({ client_id: "fixture-client", client_secret: "fixture-secret" });
    const callback = { code: "fixture-code", state: "fixture-state", iss: "https://discord.com" };
    const tokens = await client.oauthCallback("http://localhost:3000/api/auth/callback/discord", callback, { state: "fixture-state" });
    assert.equal(tokens.access_token, "fixture-token");
    await assert.rejects(client.oauthCallback("http://localhost:3000/api/auth/callback/discord", {
      ...callback, iss: "https://other.example",
    }, { state: "fixture-state" }), /iss mismatch/);
    await assert.rejects(client.oauthCallback("http://localhost:3000/api/auth/callback/discord", callback, {
      state: "different-state",
    }), /state mismatch/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
