import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_SESSION_MAX_AGE_SECONDS } from "../src/domain/auth-policy";

test("authentication sessions persist for thirty days", () => {
  assert.equal(AUTH_SESSION_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
});
