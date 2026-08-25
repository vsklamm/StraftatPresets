import assert from "node:assert/strict";
import test from "node:test";
import {
  appendTelegramDecision,
  buildTelegramModerationMessage,
  TELEGRAM_PHOTO_CAPTION_LIMIT,
  TELEGRAM_TEXT_LIMIT,
} from "../src/application/telegram-moderation-message";
import type { PresetRevisionContent } from "../src/domain/preset-content";
import { getChangedModeratableFields } from "../src/lib/moderation";

const published: PresetRevisionContent = {
  title: "<#ff0000>Game of Mines</color>",
  description: "Careful placement wins.\nWatch every corner.",
  thumbnailKey: "presets/mines.webp",
  tags: ["placement", "explosives"],
  versioningEnabled: true,
  versions: [{
    label: "v1.0.0",
    mapPlaylists: [{
      name: "<#00ff00>Close Quarters</color>",
      description: "Small maps for fast rounds.",
      encodedValue: "code",
      mapNames: ["Arena_00"],
    }],
    weaponConfigurations: [{
      kind: "swapper",
      name: "Mine Swaps",
      description: "Turns pickups into mines.",
      encodedValue: "code",
    }],
  }],
};

test("new moderation messages stay concise, preserve multiline text, and strip game formatting", () => {
  const content: PresetRevisionContent = {
    ...published,
    versions: [published.versions[0], { ...published.versions[0], label: "v1.1.0" }],
  };
  const message = buildTelegramModerationMessage({
    content,
    requiresTextReview: true,
    hasThumbnail: true,
  });

  assert.match(message.html, /^<b>🆕 New<\/b>/);
  assert.match(message.html, /<b>Game of Mines<\/b>/);
  assert.match(message.text, /Careful placement wins\.\nWatch every corner\./);
  assert.equal(message.text.match(/Mine Swaps/g)?.length, 1);
  assert.equal(message.text.match(/Close Quarters/g)?.length, 1);
  assert.doesNotMatch(message.html, /<#|<\/color>/);
  assert.ok(message.length <= TELEGRAM_PHOTO_CAPTION_LIMIT - 48);
  assert.doesNotThrow(() => appendTelegramDecision(message.html, "✅ Approved", TELEGRAM_PHOTO_CAPTION_LIMIT));
});

test("nested fields are omitted when only the picture needs review", () => {
  const message = buildTelegramModerationMessage({
    content: published,
    requiresTextReview: false,
    hasThumbnail: true,
  });
  assert.match(message.text, /Game of Mines/);
  assert.match(message.text, /Careful placement wins/);
  assert.doesNotMatch(message.text, /Mine Swaps|Close Quarters/);
});

test("published edits show the name and only changed review text", () => {
  const edited: PresetRevisionContent = {
    ...published,
    versions: [{
      ...published.versions[0],
      mapPlaylists: [{
        ...published.versions[0].mapPlaylists[0],
        name: "Tight Corners",
      }],
    }],
  };
  const message = buildTelegramModerationMessage({
    content: edited,
    previousContent: published,
    requiresTextReview: true,
    hasThumbnail: true,
  });

  assert.match(message.html, /^<b>✏️ Edit<\/b>/);
  assert.match(message.text, /Game of Mines/);
  assert.match(message.text, /Tight Corners/);
  assert.doesNotMatch(message.text, /Careful placement wins|Mine Swaps|Close Quarters/);
});

test("text and photo moderation messages reserve room for their decision", () => {
  const longContent: PresetRevisionContent = {
    ...published,
    description: "A".repeat(500),
    versions: Array.from({ length: 10 }, (_, index) => ({
      label: `v${index + 1}.0.0`,
      mapPlaylists: Array.from({ length: 7 }, (__, playlistIndex) => ({
        name: `Map ${index}-${playlistIndex} ${"N".repeat(120)}`,
        description: "D".repeat(160),
        encodedValue: "code",
        mapNames: ["Arena_00"],
      })),
      weaponConfigurations: Array.from({ length: 7 }, (__, configurationIndex) => ({
        kind: "swapper" as const,
        name: `Swap ${index}-${configurationIndex} ${"S".repeat(120)}`,
        description: "W".repeat(160),
        encodedValue: "code",
      })),
    })),
  };

  for (const hasThumbnail of [true, false]) {
    const message = buildTelegramModerationMessage({ content: longContent, requiresTextReview: true, hasThumbnail });
    const limit = hasThumbnail ? TELEGRAM_PHOTO_CAPTION_LIMIT : TELEGRAM_TEXT_LIMIT;
    assert.ok(message.length <= limit - 48);
    assert.doesNotThrow(() => appendTelegramDecision(message.html, "❌ Picture", limit));
  }
});

test("moderation diffs trust unchanged nested text after versions are reordered", () => {
  const secondVersion = {
    ...published.versions[0],
    label: "v2.0.0",
    mapPlaylists: [{ ...published.versions[0].mapPlaylists[0], name: "Open Maps" }],
  };
  const previous = { ...published, versions: [published.versions[0], secondVersion] };
  const reordered = { ...published, versions: [secondVersion, published.versions[0]] };
  assert.deepEqual(getChangedModeratableFields(previous, reordered), []);
});

test("moderation message includes author name in italics when provided", () => {
  const message = buildTelegramModerationMessage({
    authorName: "ProGamer42",
    content: published,
    requiresTextReview: false,
    hasThumbnail: true,
  });
  assert.match(message.html, /<i>by ProGamer42<\/i>/);
  assert.match(message.text, /by ProGamer42/);
});
