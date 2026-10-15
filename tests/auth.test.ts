import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { NextAuthOptions } from "next-auth";

const { authOptions } = createRequire(import.meta.url)("../src/lib/auth.ts") as { authOptions: NextAuthOptions };

test("authentication sessions persist for thirty days", () => {
  assert.equal(authOptions.session?.strategy, "jwt");
  assert.equal(authOptions.session?.maxAge, 30 * 24 * 60 * 60);
  assert.equal(authOptions.jwt?.maxAge, 30 * 24 * 60 * 60);
});
