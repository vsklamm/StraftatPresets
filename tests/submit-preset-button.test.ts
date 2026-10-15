import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmitPresetButton } from "../app/auth-control";

test("signed-out submission button makes login visible without adding a second action", () => {
  const html = renderToStaticMarkup(createElement(SubmitPresetButton, {
    status: "unauthenticated", isCreating: false, onClick: () => {},
  }));
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.match(html, /Sign in/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /Submit preset/);
  assert.doesNotMatch(html, /[+＋]/);
  assert.doesNotMatch(html, /disabled/);
});

test("authenticated submission stays concise and busy states stay disabled", () => {
  for (const status of ["authenticated", "loading"] as const) {
    const html = renderToStaticMarkup(createElement(SubmitPresetButton, {
      status, isCreating: false, onClick: () => {},
    }));
    assert.doesNotMatch(html, /Sign in|[+＋]/);
    assert.match(html, /Submit preset/);
    assert.equal(html.includes("disabled"), status === "loading");
  }
  const opening = renderToStaticMarkup(createElement(SubmitPresetButton, {
    status: "authenticated", isCreating: true, onClick: () => {},
  }));
  assert.match(opening, /Opening draft/);
  assert.match(opening, /disabled/);
  assert.doesNotMatch(opening, /Sign in|Submit preset/);
});
