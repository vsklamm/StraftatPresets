import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { GUIDE_DEFINITIONS, type GuideTopic } from "../src/domain/import-guides";

test("preset import guides are configured for randomizer, swapper, and playlist", () => {
  const topics: GuideTopic[] = ["randomizer", "swapper", "playlist"];

  for (const topic of topics) {
    const guide = GUIDE_DEFINITIONS[topic];
    assert.ok(guide, `Guide should exist for ${topic}`);
    assert.equal(guide.topic, topic);
    assert.ok(guide.title.length > 0, `Guide title should be non-empty for ${topic}`);
    assert.ok(guide.tabLabel.length > 0, `Tab label should be non-empty for ${topic}`);
    assert.ok(guide.estimatedTime.length > 0, `Estimated time should be non-empty for ${topic}`);

    // Steps count: 5 to 6 steps
    assert.ok(
      guide.steps.length >= 4 && guide.steps.length <= 6,
      `Guide for ${topic} should have 5-6 steps, but has ${guide.steps.length}`
    );

    // Each step must have valid numbering, title, description, and imageSrc
    guide.steps.forEach((step, index) => {
      assert.equal(step.stepNumber, index + 1);
      assert.ok(step.title.length > 0, `Step ${index + 1} title should not be empty`);
      assert.ok(step.description.length > 0, `Step ${index + 1} description should not be empty`);
      assert.ok(step.imageSrc, `Step ${step.stepNumber} in ${topic} should have imageSrc`);
      assert.match(
        step.imageSrc,
        /^\/guide\/[a-z0-9-]+\.webp$/,
        `Step imageSrc must be a clean webp in /guide/: ${step.imageSrc}`
      );
      assert.ok(
        fs.existsSync(path.join(process.cwd(), "public", step.imageSrc)),
        `Image file must exist at public${step.imageSrc}`
      );
    });
  }

  // Shared assets verify cross-guide reuse
  const rand = GUIDE_DEFINITIONS.randomizer;
  const swap = GUIDE_DEFINITIONS.swapper;
  const play = GUIDE_DEFINITIONS.playlist;

  // Host lobby is shared across all three
  assert.equal(rand.steps[0].imageSrc, "/guide/host-lobby.webp");
  assert.equal(swap.steps[1].imageSrc, "/guide/host-lobby.webp");
  assert.equal(play.steps[3].imageSrc, "/guide/host-lobby.webp");

  // Copy preset is shared between swapper and playlist
  assert.equal(swap.steps[0].imageSrc, "/guide/copy-preset.webp");
  assert.equal(play.steps[0].imageSrc, "/guide/copy-preset.webp");
});

test("how-to-import page renders Home and valid metadata", async () => {
  const { default: HowToImportPage, metadata } = await import("../app/how-to-import/page");
  assert.ok(metadata.title, "Metadata should have a title");
  assert.ok(metadata.description, "Metadata should have a description");
  assert.equal(metadata.alternates?.canonical, "/how-to-import");

  const vnode = HowToImportPage();
  assert.ok(vnode, "Page should render a valid React element");
  assert.equal(typeof vnode.type, "function");
});
