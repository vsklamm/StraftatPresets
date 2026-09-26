import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectInfo } from "../app/project-info";

test("project information links to source and license before separate acknowledgements", () => {
  const html = renderToStaticMarkup(createElement(ProjectInfo));
  const links = [...html.matchAll(/<a href="([^"]+)"[^>]*>/g)];
  assert.equal(links.length, 6);
  assert.equal(links[0][1], "https://github.com/vsklamm/StraftatPresets");
  assert.equal(links[1][1], "https://github.com/vsklamm/StraftatPresets/blob/main/LICENSE");
  assert.ok(html.indexOf("MIT license") < html.indexOf("Acknowledgements"));
  assert.match(html, /class="project-info-credits"/);
  for (const [anchor] of links) {
    assert.match(anchor, /target="_blank"/);
    assert.match(anchor, /rel="noreferrer"/);
    assert.match(anchor, /tabindex="-1"/);
  }
});
