import assert from "node:assert/strict";
import test from "node:test";
import { countWrappedToolLinks, fitHeaderToolLayout } from "../src/lib/header-tool-links";

const widths = [{ single: 120, double: 70 }, { single: 100, double: 60 }, { single: 140, double: 85 }, { single: 160, double: 100 }];

test("header links stay on one line while they fit and wrap from the right", () => {
  assert.equal(countWrappedToolLinks(520, widths), 0);
  assert.equal(countWrappedToolLinks(519, widths), 1);
  assert.equal(countWrappedToolLinks(460, widths), 1);
  assert.equal(countWrappedToolLinks(459, widths), 2);
  assert.equal(countWrappedToolLinks(405, widths), 2);
  assert.equal(countWrappedToolLinks(404, widths), 3);
  assert.equal(countWrappedToolLinks(365, widths), 3);
  assert.equal(countWrappedToolLinks(364, widths), 4);
});

test("tiny and empty headers stay bounded and wider headers restore single lines", () => {
  assert.equal(countWrappedToolLinks(-1, widths), 4);
  assert.equal(countWrappedToolLinks(0, []), 0);
  assert.equal(countWrappedToolLinks(1_000, widths), 0);
  assert.equal(countWrappedToolLinks(100, [{ single: 100.25, double: 65 }]), 1);
});

test("header hides the community stub only after every link is wrapped", () => {
  assert.deepEqual(fitHeaderToolLayout(315, widths, 140), {
    wrapped: 4, hideCommunity: false, hideCredit: false,
  });
  assert.deepEqual(fitHeaderToolLayout(314, widths, 140), {
    wrapped: 4, hideCommunity: true, hideCredit: false,
  });
});

test("credit hides only after removing the stub is insufficient, then restores as space returns", () => {
  assert.deepEqual(fitHeaderToolLayout(175, widths, 140), {
    wrapped: 4, hideCommunity: true, hideCredit: false,
  });
  assert.deepEqual(fitHeaderToolLayout(174, widths, 140), {
    wrapped: 4, hideCommunity: true, hideCredit: true,
  });
  assert.deepEqual(fitHeaderToolLayout(520, widths, 140), {
    wrapped: 0, hideCommunity: false, hideCredit: false,
  });
});
