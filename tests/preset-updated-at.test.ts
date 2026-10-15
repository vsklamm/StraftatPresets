import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PresetUpdatedAt } from "../app/preset-updated-at";

test("preset update metadata shows a readable date without a tooltip", () => {
  for (const updatedAt of ["2026-10-15T23:30:00Z", new Date("2026-10-15T23:30:00Z")]) {
    const html = renderToStaticMarkup(createElement(PresetUpdatedAt, { updatedAt }));
    assert.match(html, />Updated 15 Oct 2026<\/time>/);
    assert.match(html, /dateTime="2026-10-15T23:30:00.000Z"/);
    assert.doesNotMatch(html, /\btitle=|data-tooltip/);
  }
});

test("missing or invalid update dates leave no empty metadata or separator", () => {
  for (const updatedAt of [undefined, "invalid", new Date(NaN)]) {
    assert.equal(renderToStaticMarkup(createElement(PresetUpdatedAt, { updatedAt })), "");
  }
});
