import assert from "node:assert/strict";
import test from "node:test";
import {
  thumbnailKeysToDeleteAfterDraftSave,
  thumbnailKeysToDeleteAfterPublish,
} from "../src/domain/thumbnail-policy";

test("draft thumbnail cleanup preserves the image used by the published revision", () => {
  assert.deepEqual(thumbnailKeysToDeleteAfterDraftSave("published.webp", "published.webp", null), []);
  assert.deepEqual(thumbnailKeysToDeleteAfterDraftSave("draft.webp", "published.webp", null), ["draft.webp"]);
  assert.deepEqual(thumbnailKeysToDeleteAfterDraftSave("draft.webp", null, null), ["draft.webp"]);
  assert.deepEqual(thumbnailKeysToDeleteAfterDraftSave("same.webp", null, "same.webp"), []);
});

test("publishing deletes only the image replaced or removed from the live revision", () => {
  assert.deepEqual(thumbnailKeysToDeleteAfterPublish("published.webp", null), ["published.webp"]);
  assert.deepEqual(thumbnailKeysToDeleteAfterPublish("old.webp", "new.webp"), ["old.webp"]);
  assert.deepEqual(thumbnailKeysToDeleteAfterPublish("same.webp", "same.webp"), []);
  assert.deepEqual(thumbnailKeysToDeleteAfterPublish(null, "new.webp"), []);
});
