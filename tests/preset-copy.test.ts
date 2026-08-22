import assert from "node:assert/strict";
import test from "node:test";
import { copyTargetKeys, createPresetCopyManifest } from "../src/domain/preset-copy";
import type { PresetRevisionContent } from "../src/domain/preset-content";

function content(): PresetRevisionContent {
  return {
    title: "Copy targets",
    description: "A published preset used to test copy target identity.",
    thumbnailKey: null,
    tags: ["aim", "1v1"],
    versioningEnabled: true,
    versions: [
      {
        label: "v2.0.0",
        mapPlaylists: [{ name: "Renamed", description: "Changed metadata", encodedValue: "QU JD\n", mapNames: ["Map"] }],
        weaponConfigurations: [{
          kind: "randomized",
          name: "Randomized weapons",
          weapons: [{ name: "Zed", weight: 2 }, { name: "Alpha", weight: 1 }],
        }],
      },
      {
        label: "v1.0.0",
        mapPlaylists: [{ name: "Original", description: "Other metadata", encodedValue: "QUJD", mapNames: ["Map"] }],
        weaponConfigurations: [{ kind: "swapper", name: "Swap", description: "A swapper", encodedValue: "QUJD" }],
      },
    ],
  };
}

test("copy targets depend on copied content instead of version metadata", async () => {
  const manifest = await createPresetCopyManifest("revision", content());
  assert.equal(manifest.versions[0].mapPlaylists[0], manifest.versions[1].mapPlaylists[0]);
  assert.notEqual(manifest.versions[1].swappers[0], manifest.versions[1].mapPlaylists[0]);
  assert.equal(copyTargetKeys(manifest).size, 3);
});

test("randomized weapon order does not change its copy target", async () => {
  const original = content();
  const reordered = content();
  const randomized = reordered.versions[0].weaponConfigurations[0];
  if (randomized.kind !== "randomized") throw new Error("Expected randomized weapons.");
  randomized.weapons.reverse();
  const [left, right] = await Promise.all([
    createPresetCopyManifest("left", original),
    createPresetCopyManifest("right", reordered),
  ]);
  assert.equal(left.versions[0].randomizedWeapons, right.versions[0].randomizedWeapons);
});

test("changing copied content creates a new target", async () => {
  const original = content();
  const changed = content();
  changed.versions[0].mapPlaylists[0].encodedValue = "REVG";
  const [left, right] = await Promise.all([
    createPresetCopyManifest("left", original),
    createPresetCopyManifest("right", changed),
  ]);
  assert.notEqual(left.versions[0].mapPlaylists[0], right.versions[0].mapPlaylists[0]);
});
