import test from "node:test";
import assert from "node:assert/strict";
import { parsePresetIdentifier, presetSlugCandidates } from "@/src/domain/preset-content";

test("public slugs prefer the name and keep deterministic collision fallbacks", () => {
  const candidates = presetSlugCandidates("<#f00>Practice Only", "a1b2c3d4-5678-90ab-cdef-1234567890ab");
  assert.deepEqual(candidates.slice(0, 3), ["practice-only", "practice-only-a1b2c3d", "practice-only-a1b2c3d4"]);
  assert.equal(presetSlugCandidates("🥷 Practice 💥", "12345678-9999-8888-7777-666655554444")[0], "practice");
  assert.equal(presetSlugCandidates("Ħїđε ąиđ Șεąƙ", "12345678-9999-8888-7777-666655554444")[0], "preset-1234567");
  assert.equal(presetSlugCandidates("12345678-9999-8888-7777-666655554444", "a1b2c3d4-5678-90ab-cdef-1234567890ab")[0], "12345678-9999-8888-7777-666655554444-a1b2c3d");
});

test("moderation accepts canonical, legacy and UUID identifiers without URL query or fragment text", () => {
  for (const value of ["practice-arena", "https://straftatpresets.com/p/practice-arena/?q=duel#version",
    "https://straftatpresets.com/?p=practice-arena&q=duel", "?p=practice-arena", "/api/presets/practice-arena"]) {
    assert.equal(parsePresetIdentifier(value), "practice-arena");
  }
  for (const value of ["https://example.com/p/practice-arena", "/p/foo%2Fbar", "/p/foo%252Fbar", "/p/%zz", "//example.com/p/arena"]) {
    assert.equal(parsePresetIdentifier(value), null);
  }
  const title = "a".repeat(49) + " z";
  assert.equal(presetSlugCandidates(title, "12345678")[0], "a".repeat(49));
});

test("private drafts keep sanitized titles and an ID suffix", () => {
  const id = "a1b2c3d4-5678-90ab-cdef-1234567890ab";
  assert.equal(presetSlugCandidates("Practice Only", id, false)[0], "practice-only-a1b2c3d");
  assert.equal(presetSlugCandidates("Example Arena Setup (v2)", id, false)[0], "example-arena-setup-v2-a1b2c3d");
});

test("public slugs strip TMPro color and formatting tags", () => {
  const id = "f9e8d7c6-1111-2222-3333-444455556666";
  assert.equal(presetSlugCandidates("<#FF0000>Instagib <#00FF00>2.0</color>", id)[0], "instagib-2-0");
  assert.equal(presetSlugCandidates("<b><color=red>Pro</color></b> Preset", id)[0], "pro-preset");
});

test("empty or special-character titles use an ID fallback", () => {
  const id = "12345678-9999-8888-7777-666655554444";
  assert.equal(presetSlugCandidates("", id)[0], "preset-1234567");
  assert.equal(presetSlugCandidates("   ", id)[0], "preset-1234567");
  assert.equal(presetSlugCandidates("$$$ %%% @@@", id)[0], "preset-1234567");
});

test("public slug names are limited to 50 characters", () => {
  const id = "abcdef01-2345-6789-abcd-ef0123456789";
  const longTitle = "A very very very very very long preset title that exceeds the maximum length limit";
  assert.equal(presetSlugCandidates(longTitle, id)[0].length <= 50, true);
});
