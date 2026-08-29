import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUserDisplayName, validateUserDisplayName } from "../src/domain/user-display-name";

function assertRejected(value: string) {
  assert.equal("error" in validateUserDisplayName(value), true, value);
}

test("display names are normalized before storage", () => {
  assert.equal(normalizeUserDisplayName("  Mine\tHost  "), "Mine Host");
  assert.equal(normalizeUserDisplayName("Ｋｌａｍｍ"), "Klamm");
});

test("display names accept ordinary player names", () => {
  assert.deepEqual(validateUserDisplayName("GoM Host"), { displayName: "GoM Host", visibleName: "GoM Host" });
  assert.deepEqual(validateUserDisplayName("Игрок 42"), { displayName: "Игрок 42", visibleName: "Игрок 42" });
});

test("display names support TMPro colors and enforce visible and stored limits", () => {
  const colored = "<#FF5A36>GoM <#F5D86E>Host</color>";
  assert.deepEqual(validateUserDisplayName(colored), { displayName: colored, visibleName: "GoM Host" });
  assertRejected("A".repeat(33));
  assertRejected("A".repeat(401));
  assertRejected("<b>Player</b>");
});

test("clearing a display name requests the Discord-name fallback", () => {
  assert.deepEqual(validateUserDisplayName("   "), { displayName: null, visibleName: "" });
});

test("display names reject unsafe or unsuitable public values", () => {
  for (const value of ["x", "https://example.com", "<player>", "сука", "<#FF0000>сука</color>"]) {
    assertRejected(value);
  }
});
