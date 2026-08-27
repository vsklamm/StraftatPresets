import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { parsePresetRevisionContent } from "../src/domain/preset-content";
import { buildPresetSearchProjection, PRESET_SEARCH_SCHEMA_VERSION } from "../src/domain/preset-search";
import { parseD1QueryRows, parseD1RowsWritten } from "./wrangler-output";

type Target = "local" | "remote";
type PublishedRevisionRow = {
  preset_id: string;
  published_revision_id: string;
  content_json: string;
  author_name: string;
};

const target = (process.argv[2] ?? "local") as Target;
if (target !== "local" && target !== "remote") throw new Error("Usage: rebuild-preset-search.ts local|remote [--confirm rebuild-published-search]");
if (target === "remote" && process.argv[process.argv.indexOf("--confirm") + 1] !== "rebuild-published-search") {
  throw new Error("Remote rebuild requires: --confirm rebuild-published-search");
}

const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
const wranglerEnvironment = { ...process.env, CI: "true", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" };
const targetFlag = target === "remote" ? "--remote" : "--local";
const quote = (value: string) => `'${value.replaceAll("\0", "").replaceAll("'", "''")}'`;

const queryOutput = execFileSync(process.execPath, [
  wrangler,
  "d1",
  "execute",
  "DB",
  targetFlag,
  "--command",
  `SELECT p.id AS preset_id, p.published_revision_id, r.content_json, u.name AS author_name
   FROM presets p
   INNER JOIN preset_revisions r ON r.id = p.published_revision_id
   INNER JOIN users u ON u.id = p.author_id
   WHERE p.status = 'published' AND p.published_revision_id IS NOT NULL
   ORDER BY p.id`,
  "--json",
  "--yes",
], { cwd: process.cwd(), encoding: "utf8", env: wranglerEnvironment });

const rows = parseD1QueryRows<PublishedRevisionRow>(queryOutput);
const statements: string[] = [];
for (const row of rows) {
  const content = parsePresetRevisionContent(JSON.parse(row.content_json));
  const projection = await buildPresetSearchProjection(content, row.author_name);
  statements.push(`INSERT INTO preset_search_documents (preset_id, published_revision_id, schema_version, title, author, description, secondary_text, updated_at)
    SELECT ${quote(row.preset_id)}, ${quote(row.published_revision_id)}, ${projection.document.schemaVersion}, ${quote(projection.document.title)}, ${quote(projection.document.author)}, ${quote(projection.document.description)}, ${quote(projection.document.secondaryText)}, unixepoch() * 1000
    WHERE EXISTS (SELECT 1 FROM presets WHERE id = ${quote(row.preset_id)} AND status = 'published' AND published_revision_id = ${quote(row.published_revision_id)})
    ON CONFLICT(preset_id) DO UPDATE SET published_revision_id = excluded.published_revision_id, schema_version = excluded.schema_version, title = excluded.title, author = excluded.author, description = excluded.description, secondary_text = excluded.secondary_text, updated_at = excluded.updated_at;`);
  statements.push(`DELETE FROM preset_search_terms WHERE preset_id = ${quote(row.preset_id)} AND EXISTS (SELECT 1 FROM preset_search_documents WHERE preset_id = ${quote(row.preset_id)} AND published_revision_id = ${quote(row.published_revision_id)});`);
  for (const term of projection.terms) {
    statements.push(`INSERT INTO preset_search_terms (preset_id, published_revision_id, field, value)
      SELECT ${quote(row.preset_id)}, ${quote(row.published_revision_id)}, ${quote(term.field)}, ${quote(term.value)}
      WHERE EXISTS (SELECT 1 FROM preset_search_documents WHERE preset_id = ${quote(row.preset_id)} AND published_revision_id = ${quote(row.published_revision_id)});`);
  }
}
statements.push(`DELETE FROM preset_search_documents
  WHERE schema_version <> ${PRESET_SEARCH_SCHEMA_VERSION} OR NOT EXISTS (
    SELECT 1 FROM presets
    WHERE presets.id = preset_search_documents.preset_id
      AND presets.status = 'published'
      AND presets.published_revision_id = preset_search_documents.published_revision_id
  );`);

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "straftat-search-rebuild-"));
try {
  const sqlPath = path.join(temporaryDirectory, "search.sql");
  writeFileSync(sqlPath, `${statements.join("\n")}\n`);
  const output = execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", targetFlag, "--file", sqlPath, "--json", "--yes"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: wranglerEnvironment,
  });
  console.log(`Rebuilt search for ${rows.length} published presets in ${target} D1: ${parseD1RowsWritten(output)} rows written.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
