import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PresetContentLabel } from "../app/preset-content-label";
import { configLabels, type PresetVersion } from "../src/application/preset-view";

test("content counts keep their true number and cap emphasis at four", () => {
  for (const [count, emphasis] of [[1, 1], [2, 2], [3, 3], [4, 4], [8, 4]]) {
    const text = `${count} Map Playlist${count === 1 ? "" : "s"}`;
    const html = renderToStaticMarkup(createElement(PresetContentLabel, { text }));
    assert.match(html, new RegExp(`class="content-label-count" data-emphasis="${emphasis}">${count}</span> Map Playlist`));
    assert.equal(html.replace(/<[^>]*>/g, ""), text);
  }
});

test("Swapper counters preserve colored text and Randomizer stays uncounted", () => {
  for (const count of [1, 2, 3, 4, 7]) {
    const version: PresetVersion = {
      label: "v1.0",
      released: "2026-09-16",
      swapper: Array.from({ length: count }, () => ({ name: "Swapper", description: "", code: "code" })),
    };
    const [swapper] = configLabels(version);
    const html = renderToStaticMarkup(createElement(PresetContentLabel, { text: swapper }));
    assert.equal(html.replace(/<[^>]*>/g, ""), `${count} Swapper${count === 1 ? "" : "s"}`);
    assert.match(html, /style="color:/);
    assert.match(html, new RegExp(`data-emphasis="${Math.min(count, 4)}"`));
  }
  const [randomizer] = configLabels({
    label: "v1.0",
    released: "2026-09-16",
    randomizedWeapons: [{ name: "Pistol", weight: 1 }],
  });
  const randomizerHtml = renderToStaticMarkup(createElement(PresetContentLabel, { text: randomizer }));
  assert.equal(randomizerHtml.replace(/<[^>]*>/g, ""), "Randomizer");
  assert.doesNotMatch(randomizerHtml, /content-label-count/);
});
