---
name: develop-straftat-presets
description: Implement, debug, review, or maintain the StraftatPresets web app across its Next.js UI, local-first drafts, D1 and R2 persistence, catalogs, moderation, and Cloudflare Worker. Use for project code changes; remote mutations still require explicit authorization.
---

# Develop StraftatPresets

Make the smallest complete change that preserves product behavior, data safety, and the local/remote development boundary.

## Establish current truth

1. Read `AGENTS.md`, inspect `git status`, and locate the code and tests that own the behavior.
2. Use current source and installed framework documentation before commit history or remembered APIs.
3. State a checkable completion criterion and keep a tight feedback loop while editing.

The environment is a source of truth too. Read scripts, config, types, and `--help` output instead of caching easy lookups in agent documentation.

## Keep modules deep

Design deep modules: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface.

- The interface is the test surface. Callers and tests cross the same seam.
- Apply the deletion test: if deleting a module makes its complexity reappear across callers, it is earning its keep; if complexity vanishes, it was a pass-through.
- One adapter means a hypothetical seam. Two adapters means a real one. Add a seam when behavior actually varies.
- Keep domain rules in `src/domain/`, interfaces in `src/application/ports.ts`, Cloudflare adapters in `src/infrastructure/`, and transport concerns in `app/api/` or `src/lib/`.
- Reuse domain validation in browser and server code. Keep route handlers thin.

## Protect state and environments

- Use local commands by default. Treat deployment, `--remote`, and scripts ending in `:remote` as separate production actions requiring explicit authorization.
- Keep credentials, environment files, `.wrangler/`, backups, logs, caches, and user data outside commits and tool output.
- Preserve local-first draft recovery, serialized remote saves, conflict checks, and timestamps when changing autosave.
- Preserve submitted and published revisions as immutable snapshots. Edits belong to a working revision.
- Treat v1.0 and later as live production: account for existing D1 rows, R2 objects, moderation work, stored limits, older clients, cookies, local drafts, and cache keys before changing contracts or state transitions.
- Change D1 through `db/schema.ts`; create a forward-only migration with `npm run db:schema`, review its SQL, preserve custom triggers, and test both fresh initialization and upgrade behavior. Never rewrite an applied migration.
- Version or expire browser-persisted data and cached assets deliberately. Preserve recoverable drafts and avoid silently invalidating data accepted by an earlier release.
- Back up production state before destructive work. Do not tighten limits below valid stored data without an explicit transition plan.
- Treat `game-data/catalog.json` and `game-data/tags.json` as reviewed input. Runtime code does not scrape the wiki.

## Keep agent instructions relevant

When editing `AGENTS.md`, harness files, or skills:

- Keep each meaning in a single source of truth.
- Check every line for relevance. Remove stale layers instead of adding another explanation over them.
- Hunt no-ops sentence by sentence: if an instruction does not change agent behavior, delete it.
- Keep universal guidance in the entrypoint and disclose branch-specific detail behind a precise pointer.

## Complete the change

Use `npm run setup` for fresh local state and `npm run cf:types` after changing Wrangler bindings. Run focused tests during implementation and `npm run check` before handoff. For visual changes, inspect the local page. For persistence changes, test fresh D1 plus the production upgrade path. Finish with `git diff --check` and a clean accounting of every working-tree change.
