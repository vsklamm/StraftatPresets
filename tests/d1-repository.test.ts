import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "../db";
import { D1Repository } from "../src/infrastructure/d1-repository";
import { getPublishedPresetPreview } from "../src/infrastructure/d1-published-preset-preview";
import { DisplayNameAlreadyUsedError } from "../src/domain/user-profile";

type RecordedQuery = { sql: string; params: unknown[] };

function recordingD1(otherUsers: { name: string; display_name: string | null }[] = []) {
  const queries: RecordedQuery[] = [];
  let batchCalls = 0;
  const binding = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          queries.push({ sql, params });
          const rows = sql.startsWith('insert into "users"')
            ? [{ is_active: 1, name: "Discord name", display_name: null, display_name_configured_at: null, preset_limit: 4 }]
            : sql.startsWith('update "users"')
              ? [{ name: "Discord name", display_name: params[0], display_name_configured_at: params[1], preset_limit: 4 }]
              : [];
          return {
            all: async () => ({ success: true, meta: { changes: 0 }, results: sql.includes('from "users"') ? otherUsers : [] }),
            raw: async () => {
              if (sql.startsWith('insert into "users"')) return [[1, "Discord name", null, null, 4]];
              if (sql.startsWith('select "name" from "users"')) return [["Discord name"]];
              if (sql.includes('from "users"') && sql.includes('"display_name"')) return otherUsers.map((user) => [user.name, user.display_name]);
              if (sql.startsWith('update "users"')) return [["Discord name", params[0], params[1], 4]];
              return [[1]];
            },
            run: async () => ({ success: true, meta: { changes: 0 }, results: [] }),
            rows,
          };
        },
      };
    },
    async batch(statements: Array<{ rows: Record<string, unknown>[] }>) {
      batchCalls += 1;
      return statements.map((statement) => ({ success: true, meta: { changes: statement.rows.length }, results: statement.rows }));
    },
  } as unknown as D1Database;
  return { database: createDatabase(binding), queries, getBatchCalls: () => batchCalls };
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

  assert.deepEqual(profile, { displayName: coloredName, hasCustomDisplayName: true, hasConfiguredDisplayName: true, presetLimit: 4 });
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

  assert.deepEqual(profile, { displayName: "Discord name", hasCustomDisplayName: false, hasConfiguredDisplayName: true, presetLimit: 4 });
});

test("saving rejects another user's Discord name or colored display name before updating", async () => {
  const { database, queries, getBatchCalls } = recordingD1([
    { name: "Original Name", display_name: "<#FF0000>Public</color> name" },
  ]);
  const repository = new D1Repository(database);

  for (const candidate of ["original name", "PUBLIC NAME", "Publiq name"]) {
    await assert.rejects(repository.updateUserDisplayName("discord-user", candidate), DisplayNameAlreadyUsedError);
  }
  assert.equal(getBatchCalls(), 0);
  assert.equal(queries.some((query) => query.sql.startsWith('update "users"')), false);
  assert.equal(queries.some((query) => query.sql.includes('from "users"') && query.params.includes("discord-user")), true);
});

test("saving allows a substring and the user's own name", async () => {
  const { database } = recordingD1([{ name: "Player Two", display_name: null }]);
  const repository = new D1Repository(database);
  const profile = await repository.updateUserDisplayName("discord-user", "Player");
  assert.equal(profile?.displayName, "Player");
  const ownName = await repository.updateUserDisplayName("discord-user", "Discord name");
  assert.equal(ownName?.displayName, "Discord name");
});

test("clearing a custom name cannot switch to another user's name", async () => {
  const { database, getBatchCalls } = recordingD1([{ name: "Discord Name", display_name: null }]);
  const repository = new D1Repository(database);
  await assert.rejects(repository.updateUserDisplayName("discord-user", null), DisplayNameAlreadyUsedError);
  assert.equal(getBatchCalls(), 0);
});

test("preset search executes all criteria as one D1 statement", async () => {
  const { database, queries, getBatchCalls } = recordingD1();
  const repository = new D1Repository(database);

  const result = await repository.searchPublishedPresets({
    query: "mines",
    tagSlugs: ["explosives"],
    weaponGameIds: ["Claymore"],
    order: "popular",
    limit: 48,
    offset: 0,
  });

  assert.deepEqual(result, { items: [], total: 0 });
  assert.equal(getBatchCalls(), 0);
  assert.equal(queries.length, 1);
  assert.equal((queries[0].sql.match(/inner join \(/gi) ?? []).length, 2);
  assert.match(queries[0].sql, /"criterion_0"\.score \+ "criterion_1"\.score \+ "criterion_2"\.score/i);
});

test("weapon text search stays within D1 compound-select limits", async () => {
  const { database, queries } = recordingD1();
  const repository = new D1Repository(database);

  await repository.searchPublishedPresets({
    query: "Claymore",
    tagSlugs: [],
    weaponGameIds: [],
    order: "popular",
    limit: 48,
    offset: 0,
  });

  assert.equal(queries.length, 1);
  let depth = 0;
  const unionsByDepth = new Map<number, number>();
  for (const token of queries[0].sql.matchAll(/\(|\)|union all/gi)) {
    if (token[0] === "(") depth += 1;
    else if (token[0] === ")") depth -= 1;
    else unionsByDepth.set(depth, (unionsByDepth.get(depth) ?? 0) + 1);
  }
  assert.ok(Math.max(0, ...unionsByDepth.values()) <= 4, "a compound SELECT may contain at most five terms in D1");
});

test("published preset previews read only the trusted published revision", async () => {
  let recordedSql = "";
  let recordedParams: unknown[] = [];
  const binding = {
    prepare(sql: string) {
      recordedSql = sql;
      return {
        bind(...params: unknown[]) {
          recordedParams = params;
          return {
            first: async () => ({
              id: "preset-id",
              slug: "published-title-preset",
              author_name: "Author",
              title: "Published title",
              description: "",
              thumbnail_key: "presets/preset-id/thumbnail.webp",
            }),
          };
        },
      };
    },
  } as unknown as D1Database;

  assert.deepEqual(await getPublishedPresetPreview(binding, "published-title-preset"), {
    id: "preset-id",
    slug: "published-title-preset",
    title: "Published title",
    description: "",
    authorName: "Author",
    thumbnailKey: "presets/preset-id/thumbnail.webp",
  });
  assert.deepEqual(recordedParams, ["published-title-preset"]);
  assert.match(recordedSql, /inner join preset_revisions/i);
  assert.match(recordedSql, /p\.status = 'published'/i);
  assert.match(recordedSql, /p\.published_revision_id is not null/i);
});
