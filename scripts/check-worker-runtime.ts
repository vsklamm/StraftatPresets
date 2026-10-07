import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unstable_dev, type Unstable_RawConfig } from "wrangler";
import { APP_VERSION } from "../src/lib/app-version";

const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")) as Unstable_RawConfig;
const directory = await mkdtemp(path.join(tmpdir(), "straftat-worker-smoke-"));
const configPath = path.join(directory, "wrangler.json");
const name = "straftat-presets-smoke";
await writeFile(configPath, JSON.stringify({
  ...config,
  name,
  main: path.resolve(config.main!),
  assets: { ...config.assets, directory: path.resolve(config.assets!.directory!) },
  services: config.services?.map((service) => ({ ...service, service: service.service === config.name ? name : service.service, remote: false })),
  vars: {
    NEXTAUTH_URL: "http://localhost:8787",
    NEXTAUTH_SECRET: "local-worker-smoke-secret-not-for-production",
    DISCORD_CLIENT_ID: "smoke-client",
    DISCORD_CLIENT_SECRET: "smoke-client-secret",
  },
}));

let worker: Awaited<ReturnType<typeof unstable_dev>> | undefined;
try {
  worker = await unstable_dev(path.resolve(config.main!), {
    config: configPath,
    local: true,
    persist: false,
    port: 0,
    inspectorPort: 0,
    logLevel: "error",
    experimental: { forceLocal: true, watch: false, disableExperimentalWarning: true, disableDevRegistry: true },
  });
  const health = await worker.fetch("/api/health");
  assert.equal(health.status, 200, "Built Worker database health check failed");
  assert.deepEqual(await health.json(), { status: "ok" });

  const home = await worker.fetch("/");
  assert.equal(home.status, 200, "Built Worker homepage failed");
  assert.ok((await home.text()).replace(/<!--.*?-->/gs, "").includes(`<strong>v${APP_VERSION}</strong>`));

  const signIn = await worker.fetch("/auth/signin?error=OAuthCallback");
  assert.equal(signIn.status, 200, "Built Worker sign-in page failed");
  assert.match(await signIn.text(), /Discord sign-in could not be completed\. Please try again\./);

  const providers = await worker.fetch("/api/auth/providers");
  assert.equal(providers.status, 200, "Built Worker auth providers failed");
  assert.ok((await providers.json() as Record<string, unknown>).discord);
  console.log("Worker runtime OK: homepage, database health, sign-in error page and Discord provider.");
} finally {
  await worker?.stop();
  await rm(directory, { recursive: true, force: true });
}
