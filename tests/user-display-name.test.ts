import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUserDisplayName, validateUserDisplayName } from "../src/domain/user-display-name";
import { namesConflict } from "../src/domain/user-profile";

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

test("name conflicts ignore case, spacing, and TMPro colors", () => {
  assert.equal(namesConflict("  <#FF0000>GoM</color> Host ", "gom host"), true);
  assert.equal(namesConflict("Ｐｌａｙｅｒ", "player"), true);
  assert.equal(namesConflict("<color=red>Player</color>", "player"), true);
});

test("fuzzy conflicts stay narrow for short names and substrings", () => {
  assert.equal(namesConflict("Player", "Plaver"), true);
  assert.equal(namesConflict("Klamm", "Klamn"), false);
  assert.equal(namesConflict("Cat", "Cats"), false);
  assert.equal(namesConflict("The Player", "Player"), false);
  assert.equal(namesConflict("Player", "The Player"), false);
  assert.equal(namesConflict("Players", "Player"), false);
  assert.equal(namesConflict("Player", "Players"), false);
  assert.equal(namesConflict("Player", "Plxver"), false);
});
