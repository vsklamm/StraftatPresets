import assert from "node:assert/strict";
import test from "node:test";
import { parseD1RowsWritten } from "../scripts/wrangler-output";

test("reads rows written from plain Wrangler JSON", () => {
  assert.equal(parseD1RowsWritten('[{"meta":{"rows_written":3}}]'), 3);
});

test("ignores Wrangler progress output before remote JSON", () => {
  const output = `├ Checking if file needs uploading
├ Uploading file
[
  {"meta":{"rows_written":4}},
  {"meta":{"rows_written":2}}
]`;

  assert.equal(parseD1RowsWritten(output), 6);
});

test("rejects output without a JSON response", () => {
  assert.throws(() => parseD1RowsWritten("Checking D1"), /valid D1 JSON/);
});
