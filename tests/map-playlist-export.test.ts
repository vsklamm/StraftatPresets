import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { decodeMapPlaylistExport } from "../src/domain/map-playlist-export";

function encodeJson(value: unknown, gzip = false) {
  const bytes = Buffer.from(JSON.stringify(value));
  return (gzip ? gzipSync(bytes) : bytes).toString("base64");
}

test("map playlist exports decode from plain and gzipped base64", async () => {
  const value = { name: "GoM: Mix", maps: ["Arena_00", "Adobe_00"], type: "playlist" };
  assert.deepEqual(await decodeMapPlaylistExport(encodeJson(value)), { name: value.name, mapNames: value.maps });
  assert.deepEqual(await decodeMapPlaylistExport(encodeJson(value, true)), { name: value.name, mapNames: value.maps });
});

test("map playlist exports reject malformed and empty data", async () => {
  await assert.rejects(decodeMapPlaylistExport("not base64"), /Invalid map playlist export/);
  await assert.rejects(decodeMapPlaylistExport(encodeJson({ name: "Empty", maps: [] })), /missing its name or maps/);
  await assert.rejects(decodeMapPlaylistExport(encodeJson({ name: "Bad Map", maps: ["Adobe_00", "InvalidMap_99"] })), /Unsupported map: InvalidMap_99/);
});
