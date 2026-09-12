import assert from "node:assert/strict";
import test from "node:test";
import { formatPresetIssueMessage } from "../src/application/preset-issue-message";
import type { PresetRevisionContent } from "../src/domain/preset-content";
import type { PresetIssue } from "../src/domain/preset-workflow";

const content: PresetRevisionContent = {
  title: "Versioned preset",
  description: "A complete preset used to test issue locations.",
  thumbnailKey: null,
  tags: ["aim", "movement"],
  versioningEnabled: true,
  versions: [{
    label: "v2.1.0",
    mapPlaylists: [
      { name: "First", description: "First maps", encodedValue: "first", mapNames: ["Arena_00"] },
      { name: "Second", description: "Second maps", encodedValue: "second", mapNames: ["Arena_00"] },
    ],
    weaponConfigurations: [
      { kind: "randomized", name: "Randomizer Settings", weapons: [] },
      { kind: "swapper", name: "First swapper", encodedValue: "first" },
      { kind: "swapper", name: "Second swapper", encodedValue: "second" },
    ],
  }],
};

function issue(field: string, message: string): PresetIssue {
  return { source: "validation", field, code: "test", message };
}

test("submission issue messages identify the version and numbered editor section", () => {
  assert.equal(
    formatPresetIssueMessage(issue("versions.0.mapPlaylists.1.encodedValue", "Add the encoded map playlist"), content),
    "Version v2.1, map playlist 2: Add the encoded map playlist",
  );
  assert.equal(
    formatPresetIssueMessage(issue("versions.0.weaponConfigurations.2.encodedValue", "Add the encoded Swapper Settings"), content),
    "Version v2.1, swapper 2: Add the encoded Swapper Settings",
  );
});

test("submission issue messages omit versions when versioning is disabled", () => {
  const unversioned = { ...content, versioningEnabled: false };
  assert.equal(
    formatPresetIssueMessage(issue("versions.0.mapPlaylists.1.description", "Playlist description is too long"), unversioned),
    "Map playlist 2: Playlist description is too long",
  );
  assert.equal(
    formatPresetIssueMessage(issue("versions.0.weaponConfigurations.1.encodedValue", "The swapper export is invalid"), unversioned),
    "Swapper 1: The swapper export is invalid",
  );
});

test("submission issue messages leave unrelated and randomizer settings errors concise", () => {
  assert.equal(formatPresetIssueMessage(issue("title", "Add a preset name"), content), "Add a preset name");
  assert.equal(
    formatPresetIssueMessage(issue("versions.0.weaponConfigurations.0.weapons", "Add at least one weapon"), content),
    "Version v2.1: Add at least one weapon",
  );
});
