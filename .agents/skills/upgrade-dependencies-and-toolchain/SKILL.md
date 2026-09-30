---
name: upgrade-dependencies-and-toolchain
description: >-
  Perform a complete, one-shot upgrade of StraftatPresets dependencies and toolchain
  (Node, npm, Wrangler, workerd, OpenNext Cloudflare, Next.js, React, Drizzle, Zod,
  Sharp, ESLint, TypeScript, and transitive packages). Use when asked to upgrade,
  update dependencies or tooling, audit CVEs/vulnerabilities, or adopt new library
  and toolchain improvements.
---

# Upgrade Dependencies and Toolchain

Execute upgrades end-to-end in a single autonomous pass: audit current and candidate versions, resolve compatibility and peer constraints, eliminate CVEs, adopt high-leverage library or toolchain improvements, and pass the full verification gate without pausing for routine confirmation.

## 1. Inspect current state and constraints

1. Read `AGENTS.md`, `.npmrc`, `.nvmrc`, `package.json`, and `wrangler.jsonc`.
2. Respect `.npmrc` invariants: `save-exact=true`, `engine-strict=true`, and `strict-peer-deps=true`. Pin exact versions (`x.y.z`) without range prefixes (`^` or `~`).
3. Run baseline checks:
   - `node -v` and `npm -v` against `.nvmrc`, `package.json#engines`, and `package.json#packageManager`.
   - `npm outdated` to list all direct packages with newer versions.
   - `npm audit` to record existing direct and transitive security advisories.

## 2. Verify compatibility across coupled groups

Before editing `package.json`, inspect candidate `peerDependencies`, `dependencies`, and `engines` with `npm view <pkg>@<version> peerDependencies dependencies engines`. Resolve versions as compatible groups:

- **Next.js, OpenNext Cloudflare, and ESLint Config Next**:
  - Check `npm view @opennextjs/cloudflare@latest peerDependencies` first. Upgrade `next` and `eslint-config-next` to the same exact version supported by `@opennextjs/cloudflare`.
  - Keep `--webpack` on `next dev` and `next build` unless `@opennextjs/cloudflare` explicitly supports Turbopack production builds for all configured bindings.
- **React and DOM types**:
  - Upgrade `react`, `react-dom`, `@types/react`, and `@types/react-dom` in lockstep, verifying compatibility with the target `next` peer range.
- **Wrangler, `workerd`, `@cloudflare/workers-types`, and `allowScripts`**:
  - Inspect `npm view wrangler@<target> dependencies` to identify the exact `workerd` and `esbuild` versions bundled by the new Wrangler release.
  - Update `package.json#allowScripts` to whitelist the exact `workerd@<version>` and `esbuild@<version>` required by the new lockfile, and prune obsolete versions that are no longer installed.
  - Upgrade `@cloudflare/workers-types` to the latest release matching the runtime.
  - Review `wrangler.jsonc#compatibility_date`: only advance it to a date supported by the installed `workerd` binary (`<=` the `workerd` release date).
- **ESLint and TypeScript toolchain**:
  - Inspect `npm view eslint-config-next@<target> dependencies` and check the `peerDependencies` of `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-import`, and `eslint-plugin-jsx-a11y`.
  - Stay on the highest compatible version within the current major (`eslint` and `typescript`) when transitive lint plugins cap support below the next major (for example, hold `eslint@9.x` and `typescript@6.x` until `eslint-config-next` and `typescript-eslint` declare peer support for the next major).
- **Node.js, npm, and `@types/node`**:
  - Keep `@types/node` on the latest release matching the active Node major in `package.json#engines.node` (query `npm view @types/node@<major> version`), rather than jumping to a newer Node major's type definitions.
  - Only bump `.nvmrc`, `engines`, or `packageManager` when the local environment has the target Node/npm binary installed and verified.
- **Database, validation, and media (`drizzle-orm`, `drizzle-kit`, `zod`, `sharp`, `@2toad/profanity`, `franc-min`, `next-auth`)**:
  - Verify `drizzle-kit` compatibility with `drizzle-orm` before upgrading either.
  - Keep `next-auth` on `4.x` unless an explicit Auth.js v5 migration is requested.

## 3. Audit CVEs in old and new versions

1. Check every outdated package and every `npm audit` advisory (GHSA/CVE) across both direct and transitive dependencies (`npm ls <pkg>`).
2. Verify that target versions of direct dependencies (`next`, `sharp`, `wrangler`, `zod`, etc.) fix known advisories and do not have newly published CVEs (`npm audit` after install).
3. Watch nested toolchain trees, especially `wrangler -> miniflare -> sharp` and `eslint -> @eslint/eslintrc -> js-yaml`.
4. After updating `package.json` and running `npm install`:
   - Run `npm audit`.
   - If transitive vulnerabilities remain within compatible semver ranges, run `npm audit fix` (never `npm audit fix --force`, which ignores peer locks and downgrades/jumps majors).
   - If a transitive vulnerability has no semver-in-range parent release, add a minimal, targeted entry in `package.json#overrides` and verify whether existing `overrides` (such as `@esbuild-kit/core-utils`) are still needed.
   - Confirm `npm audit` reports `0 vulnerabilities`.
5. Preserve runtime security invariants:
   - Production CSP in `src/lib/security-config.ts` omits `'unsafe-eval'`. Ensure Zod v4 retains `jitless: true` (`globalThis.__zod_globalConfig = { jitless: true }` in `app/layout.tsx` and `z.config({ jitless: true })` in `src/domain/preset-content.ts`) so client initialization never triggers `new Function()` CSP violations.

## 4. Review release notes and apply worthwhile improvements

1. Research changelogs and release notes for upgraded packages (using `search_web` or package documentation in `node_modules/`).
2. Check for:
   - Deprecations, renamed options, or stricter type/lint checks triggered by the upgrade.
   - Drop-in performance, memory, or bundle-size improvements (for example, faster schema/URL validation methods, OpenNext chunk deduplication, or cleaner framework config options).
   - Obsolete workarounds or dead imports in the codebase that the upgraded library or linter now flags or renders unnecessary.
3. Act autonomously:
   - If a change is low-risk, self-contained, and clearly improves code quality, performance, security, or build hygiene, apply it immediately as part of the upgrade.
   - Do not ask the user whether to adopt routine improvements or deprecation fixes. Skip speculative refactors or feature additions that alter product behavior without clear value.

## 5. Regenerate artifacts and run the verification gate

1. Run `npm install` and verify `package-lock.json` updates cleanly without peer dependency errors or blocked install scripts.
2. If `wrangler`, `@cloudflare/workers-types`, or `wrangler.jsonc` changed, run `npm run cf:types` to synchronize `cloudflare-env.d.ts`.
3. Run the full verification suite:
   - `npm audit` (must report `0 vulnerabilities`).
   - `npm run check` (runs `check-game-catalog.ts`, `check-tag-catalog.ts`, `npm run lint` with 0 errors and 0 warnings, `npm run typecheck`, `npm test`, and `npm run worker:build` including the compressed Worker bundle budget check in `scripts/check-worker-bundle.ts`).
   - `git diff --check`.
4. Summarize the completed upgrade concisely: packages upgraded, major versions intentionally held back (with exact peer/compatibility reasons), CVEs resolved, and any code/config improvements applied.
