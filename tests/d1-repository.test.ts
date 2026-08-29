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
          const rows = sql.startsWith('insert into "users"')
            ? [{ is_active: 1, name: "Discord name", display_name: null, display_name_configured_at: null }]
            : sql.startsWith('update "users"')
              ? [{ name: "Discord name", display_name: params[0], display_name_configured_at: params[1] }]
              : [];
          return {
            raw: async () => {
              if (sql.startsWith('insert into "users"')) return [[1, "Discord name", null, null]];
              if (sql.startsWith('select "name" from "users"')) return [["Discord name"]];
              if (sql.startsWith('update "users"')) return [["Discord name", params[0], params[1]]];
              return [[1]];
            },
            run: async () => ({ success: true, meta: { changes: 0 }, results: [] }),
            rows,
          };
        },
      };
    },
    async batch(statements: Array<{ rows: Record<string, unknown>[] }>) {
      return statements.map((statement) => ({ success: true, meta: { changes: statement.rows.length }, results: statement.rows }));
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

test("a custom display name refreshes published search documents", async () => {
  const { database, queries } = recordingD1();
  const repository = new D1Repository(database);
  const coloredName = "<#FF5A36>Public</color> name";

  const profile = await repository.updateUserDisplayName("discord-user", coloredName);

  assert.deepEqual(profile, { displayName: coloredName, hasCustomDisplayName: true, hasConfiguredDisplayName: true });
  const refresh = queries.find((query) => query.sql.includes('update "preset_search_documents"'));
  assert.ok(refresh);
  assert.equal(refresh.params.includes("Public name"), true);
  assert.equal(refresh.params.includes(coloredName), false);
  assert.equal(refresh.params.some((param) => param instanceof Date), false);
});

test("clearing a custom display name restores the Discord name without reopening first-time setup", async () => {
  const { database } = recordingD1();
  const repository = new D1Repository(database);

  const profile = await repository.updateUserDisplayName("discord-user", null);

  assert.deepEqual(profile, { displayName: "Discord name", hasCustomDisplayName: false, hasConfiguredDisplayName: true });
});
