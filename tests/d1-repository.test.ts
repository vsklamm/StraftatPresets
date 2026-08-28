import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "../db";
import { D1Repository } from "../src/infrastructure/d1-repository";

type RecordedQuery = { sql: string; params: unknown[] };

function recordingD1() {
  const queries: RecordedQuery[] = [];
  const binding = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          queries.push({ sql, params });
          return {
            raw: async () => [[1]],
            run: async () => ({ success: true, meta: { changes: 0 }, results: [] }),
          };
        },
      };
    },
  } as unknown as D1Database;
  return { database: createDatabase(binding), queries };
}

test("Discord user refresh binds search document timestamps as D1 integers", async () => {
  const { database, queries } = recordingD1();
  const repository = new D1Repository(database);

  await repository.upsertDiscordUser("discord-user", "Updated name");

  const refresh = queries.find((query) => query.sql.includes('update "preset_search_documents"'));
  assert.ok(refresh);
  assert.equal(refresh.params.some((param) => param instanceof Date), false);
  assert.equal(refresh.params.some((param) => typeof param === "number" && param > 1_000_000_000_000), true);
});
