import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNetworkPrefix } from "../src/domain/network-identity";

test("network identity stores only coarse IP prefixes", () => {
  assert.equal(normalizeNetworkPrefix("192.0.2.123"), "192.0.2.0/24");
  assert.equal(normalizeNetworkPrefix("2001:db8:abcd:12::9"), "2001:0db8:abcd:0012::/64");
  assert.equal(normalizeNetworkPrefix("::ffff:192.0.2.8"), "192.0.2.0/24");
  assert.equal(normalizeNetworkPrefix("not-an-ip"), null);
});
