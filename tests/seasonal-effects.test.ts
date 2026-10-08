import assert from "node:assert/strict";
import test from "node:test";
import { seasonalEffects, selectSeasonalEffect } from "../src/seasonal/registry";

test("seasonal selection enables Halloween only October 10 through November 5", () => {
  for (const [month, day, expected] of [[9, 9, false], [9, 10, true], [9, 31, true], [10, 1, true], [10, 5, true], [10, 6, false], [0, 31, false]] as const) {
    assert.equal(selectSeasonalEffect(seasonalEffects, new Date(2026, month, day))?.id === "halloween", expected);
  }
});

test("a registered effect can span New Year without changing the loader", () => {
  const winter = { ...seasonalEffects[0], id: "winter", from: [12, 20] as const, through: [1, 5] as const };
  for (const [month, day, expected] of [[11, 19, false], [11, 20, true], [0, 5, true], [0, 6, false]] as const) {
    assert.equal(selectSeasonalEffect([winter], new Date(2026, month, day))?.id === "winter", expected);
  }
});
