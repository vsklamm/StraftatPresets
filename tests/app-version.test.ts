import assert from "node:assert/strict";
import test from "node:test";
import packageJson from "../package.json";
import { APP_VERSION } from "../src/lib/app-version";

test("app version stays synchronized with package.json", () => {
  assert.equal(APP_VERSION, packageJson.version);
});
