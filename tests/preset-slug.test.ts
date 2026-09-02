import test from "node:test";
import assert from "node:assert/strict";
import { resolvePresetSlug, slugifyPresetTitle } from "@/src/domain/preset-content";

test("slugifyPresetTitle creates slug with sanitized title and 7-character suffix", () => {
  const id = "a1b2c3d4-5678-90ab-cdef-1234567890ab";
  assert.equal(slugifyPresetTitle("Snipers only", id), "snipers-only-a1b2c3d");
  assert.equal(slugifyPresetTitle("Game of Mines (v2)", id), "game-of-mines-v2-a1b2c3d");
});

test("slugifyPresetTitle strips TMPro color tags before slugifying", () => {
  const id = "f9e8d7c6-1111-2222-3333-444455556666";
  assert.equal(slugifyPresetTitle("<#FF0000>Instagib <#00FF00>2.0</color>", id), "instagib-2-0-f9e8d7c");
  assert.equal(slugifyPresetTitle("<b><color=red>Pro</color></b> Preset", id), "pro-preset-f9e8d7c");
});

test("slugifyPresetTitle handles empty or special character titles gracefully", () => {
  const id = "12345678-9999-8888-7777-666655554444";
  assert.equal(slugifyPresetTitle("", id), "preset-1234567");
  assert.equal(slugifyPresetTitle("   ", id), "preset-1234567");
  assert.equal(slugifyPresetTitle("$$$ %%% @@@", id), "preset-1234567");
});

test("slugifyPresetTitle limits title base length to 50 characters", () => {
  const id = "abcdef01-2345-6789-abcd-ef0123456789";
  const longTitle = "A very very very very very long preset title that exceeds the maximum length limit";
  const slug = slugifyPresetTitle(longTitle, id);
  assert.equal(slug.endsWith("-abcdef0"), true);
  const base = slug.slice(0, -8);
  assert.equal(base.length <= 50, true);
});

test("resolvePresetSlug follows draft titles until the first publication", () => {
  const id = "a1b2c3d4-5678-90ab-cdef-1234567890ab";
  assert.equal(resolvePresetSlug("old-a1b2c3d", "Approved title", id, false), "approved-title-a1b2c3d");
});

test("resolvePresetSlug preserves a link after publication or retraction", () => {
  const id = "a1b2c3d4-5678-90ab-cdef-1234567890ab";
  assert.equal(resolvePresetSlug("trusted-link-a1b2c3d", "Changed title", id, true), "trusted-link-a1b2c3d");
});
