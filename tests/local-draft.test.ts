import test from "node:test";
import assert from "node:assert/strict";
import {
  localDraftKey,
  isUnmodifiedStarterDraft,
  serializeLocalDraftSnapshot,
  parseLocalDraftSnapshot,
  reconcileLocalDraftWithRemote,
} from "../src/domain/preset-local-draft";
import { createStarterPresetContent } from "../src/domain/preset-content";

test("localDraftKey generates consistent prefixed keys", () => {
  assert.equal(localDraftKey("abc-123"), "straftat-presets:draft:abc-123");
});

test("only the unchanged starter content is treated as a disposable draft", () => {
  const starter = createStarterPresetContent("Untitled");
  const signature = JSON.stringify(starter);
  assert.equal(isUnmodifiedStarterDraft(starter, signature), true);
  assert.equal(isUnmodifiedStarterDraft({ ...starter, title: "Game of Mines" }, signature), false);
  assert.equal(isUnmodifiedStarterDraft({ ...starter, description: "Changed" }, signature), false);
  assert.equal(isUnmodifiedStarterDraft(starter, undefined), false);
});

test("serializes and parses valid local draft snapshot with timestamp", () => {
  const content = createStarterPresetContent("My Test Preset");
  const now = 1700000000000;
  const serialized = serializeLocalDraftSnapshot({
    revisionId: "rev-1",
    editVersion: 2,
    content,
    updatedAt: now,
  });

  const parsed = parseLocalDraftSnapshot(serialized);
  assert.ok(parsed);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.revisionId, "rev-1");
  assert.equal(parsed.editVersion, 2);
  assert.equal(parsed.updatedAt, now);
  assert.equal(parsed.content.title, "My Test Preset");
});

test("parses invalid or corrupted snapshots as null", () => {
  assert.equal(parseLocalDraftSnapshot(null), null);
  assert.equal(parseLocalDraftSnapshot(""), null);
  assert.equal(parseLocalDraftSnapshot("{ invalid json"), null);
  assert.equal(parseLocalDraftSnapshot(JSON.stringify({ schemaVersion: 2 })), null);
  assert.equal(parseLocalDraftSnapshot(JSON.stringify({ schemaVersion: 1, revisionId: "", content: {} })), null);
});

test("reconcileLocalDraftWithRemote prefers local draft when local timestamp is newer", () => {
  const remoteContent = createStarterPresetContent("Remote Title");
  const localContent = createStarterPresetContent("Local Edited Title");

  const remote = {
    revisionId: "rev-1",
    editVersion: 1,
    updatedAt: new Date("2026-01-01T12:00:00Z"),
    content: remoteContent,
  };

  const localSnapshot = {
    schemaVersion: 1 as const,
    revisionId: "rev-1",
    editVersion: 1,
    updatedAt: new Date("2026-01-01T12:05:00Z").getTime(),
    content: localContent,
  };

  const result = reconcileLocalDraftWithRemote(remote, localSnapshot);
  assert.equal(result.isLocalNewer, true);
  assert.equal(result.shouldClearLocal, false);
  assert.equal(result.effectiveContent.title, "Local Edited Title");
});

test("reconcileLocalDraftWithRemote prefers remote when remote timestamp is newer", () => {
  const remoteContent = createStarterPresetContent("Newer Remote Title");
  const localContent = createStarterPresetContent("Stale Local Title");

  const remote = {
    revisionId: "rev-1",
    editVersion: 2,
    updatedAt: new Date("2026-01-01T12:10:00Z"),
    content: remoteContent,
  };

  const localSnapshot = {
    schemaVersion: 1 as const,
    revisionId: "rev-1",
    editVersion: 1,
    updatedAt: new Date("2026-01-01T12:00:00Z").getTime(),
    content: localContent,
  };

  const result = reconcileLocalDraftWithRemote(remote, localSnapshot);
  assert.equal(result.isLocalNewer, false);
  assert.equal(result.shouldClearLocal, true);
  assert.equal(result.effectiveContent.title, "Newer Remote Title");
});

test("reconcileLocalDraftWithRemote handles matching content seamlessly", () => {
  const content = createStarterPresetContent("Identical Title");
  const remote = {
    revisionId: "rev-1",
    editVersion: 1,
    updatedAt: new Date("2026-01-01T12:00:00Z"),
    content,
  };

  const localSnapshot = {
    schemaVersion: 1 as const,
    revisionId: "rev-1",
    editVersion: 1,
    updatedAt: new Date("2026-01-01T12:00:00Z").getTime(),
    content,
  };

  const result = reconcileLocalDraftWithRemote(remote, localSnapshot);
  assert.equal(result.isLocalNewer, false);
  assert.equal(result.shouldClearLocal, true);
  assert.equal(result.effectiveContent.title, "Identical Title");
});
