import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TagPickerList } from "../app/search-tools";

test("tag pickers display available tags under their category and omit empty categories", () => {
  const html = renderToStaticMarkup(createElement(TagPickerList, {
    tags: [
      { slug: "small-maps", label: "Small Maps", category: "maps" },
      { slug: "1v1", label: "1v1", category: "lobby" },
    ],
    onSelect: () => {},
  }));
  assert.match(html, /search-tag-group-title">lobby<\/span>.*>1v1<\/button>/);
  assert.match(html, /search-tag-group-title">maps<\/span>.*>Small Maps<\/button>/);
  assert.ok(html.indexOf(">lobby<") < html.indexOf(">maps<"));
  assert.doesNotMatch(html, />gameplay<|>weapons</);
  assert.equal((html.match(/class="search-tag-pill"/g) ?? []).length, 2);
});
