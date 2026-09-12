import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_STRAFTOOLS_URL,
  straftoolsImportUrl,
} from "../src/lib/straftools-deep-link";

test("builds a playlist import link without changing base64 data", () => {
  const encoded = "base64+with/slashes==";
  const url = new URL(straftoolsImportUrl("playlist", `  ${encoded}\n`));
  const params = new URLSearchParams(url.hash.slice(1));

  assert.equal(url.origin, "https://straftools.vercel.app");
  assert.equal(params.get("import"), "playlist");
  assert.equal(params.get("data"), encoded);
});

test("supports the local Straftools server for development", () => {
  const url = new URL(straftoolsImportUrl("swapper", "payload", LOCAL_STRAFTOOLS_URL));
  const params = new URLSearchParams(url.hash.slice(1));

  assert.equal(url.origin, "http://localhost:5173");
  assert.equal(params.get("import"), "swapper");
  assert.equal(params.get("data"), "payload");
});

test("swapper links default to the live builder and keep payloads out of the query", () => {
  const url = new URL(straftoolsImportUrl("swapper", "base64+with/slashes=="));
  assert.equal(url.origin, "https://straftools.vercel.app");
  assert.equal(url.search, "");
  const params = new URLSearchParams(url.hash.slice(1));
  assert.equal(params.get("import"), "swapper");
  assert.equal(params.get("data"), "base64+with/slashes==");
});
