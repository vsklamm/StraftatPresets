# StraftatPresets

A full-stack Next.js application for sharing STRAFTAT map playlists and weapon configurations. The same application runs locally through Wrangler and deploys to Cloudflare Workers.

## Stack

- Next.js 16, React 19, and TypeScript
- OpenNext for Cloudflare Workers
- Cloudflare D1 through Drizzle ORM
- Private Cloudflare R2 thumbnail storage
- Auth.js with Discord OAuth
- Telegram-assisted preset and thumbnail review

## Local development

Install Node.js 24.19.0 LTS. The required Node and npm versions are recorded in `.nvmrc` and `package.json`.

```bash
git clone <repository-url>
cd straftat_presets
nvm install
nvm use
npm install -g npm@12.0.2
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The development command initializes persistent local D1 and R2 state under `.wrangler/`; it does not use remote Cloudflare resources.

The gallery and local APIs work without Cloudflare, Discord, or Telegram credentials. Copy `.env.example` to `.env.local` only when testing integrations.

Direct dependencies are exact-pinned. `npm outdated` intentionally reports Node 26 types because this project targets Node 24 LTS, and ESLint 10 plus TypeScript 7 because the current Next.js lint stack does not yet accept those majors.

### Discord OAuth

Add this redirect URI to a Discord application:

```text
http://localhost:3000/api/auth/callback/discord
```

Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in `.env.local`. Local setup creates `NEXTAUTH_SECRET` when it is missing. Sessions use encrypted JWT cookies and D1 stores only the Discord account ID, current display name, active state, and login timestamps.

## Common commands

```bash
npm run dev                 # initialize local state and start Next.js
npm run preview             # build and run a local Worker preview
npm run check               # catalogs, lint, types, tests, and Next.js build
npm run check:cloudflare    # all checks plus the Worker bundle
npm run db:schema           # generate a migration after changing db/schema.ts
npm run db:setup:local      # apply migrations to local D1
npm run db:backup           # export local D1 to the ignored backups directory
npm run game:check          # validate the game catalog and weapon assets
npm run game:sync           # mirror the reviewed catalog into local D1
npm run tags:check          # validate the tag catalog
npm run tags:sync           # mirror the reviewed tags into local D1
npm run stats               # inspect local ranking and abuse signals
npm run review              # process the local moderation queue
```

Commands ending in `:remote` and `npm run deploy` can mutate remote state. Run them only for an intentional production operation.

## Catalogs and assets

[`game-data/catalog.json`](game-data/catalog.json) is the reviewed source for the supported STRAFTAT release, map IDs, and canonical weapons. [`game-data/tags.json`](game-data/tags.json) is the reviewed public tag list. Browser and server validation use these same files, while D1 mirrors the data for indexed lookups and foreign-key checks.

Weapon images are metadata-free transparent WebP files in `public/weapons/`. To prepare a game update:

```bash
npm run game:update
npm run game:check
npm run game:sync
npm run check
```

Review all generated catalog and image changes before committing. Runtime requests never scrape the wiki.

Tag entries contain only `slug`, `label`, and `category`. Presets can use at most eight tags and gallery cards show at most five. Run `npm run tags` to list local tags; the supported edit commands are `add`, `rename`, `enable`, and `disable`.

## Presets and moderation

Published presets require a name, a useful description, at least one version, at least one map playlist, and two to eight tags. Weapon settings are optional. Drafts are saved locally first and synchronized to D1 without replacing immutable submitted or published revisions.

Uploaded thumbnails are limited to JPEG or PNG input of at most 2 MB. The browser and server validate the file, the server converts it to WebP, and only the processed image is stored in private R2. New or changed thumbnails require manual review before publication.

## Cloudflare setup

The committed `wrangler.jsonc` contains a placeholder D1 ID. Create fresh resources, then replace that placeholder with the ID returned by Wrangler:

```bash
npx wrangler d1 create straftat-presets
npx wrangler r2 bucket create straftat-presets-thumbnails
npx wrangler r2 bucket create straftat-presets-thumbnails-preview
```

Copy `.env.production.example` to `.env.production`, fill it locally, and keep it untracked. Add the production Discord redirect URI:

```text
https://your-domain.example/api/auth/callback/discord
```

Initialize and validate the fresh remote database before the first deployment:

```bash
npm run db:setup:remote
npm run game:sync:remote -- --confirm <supported-release>
npm run tags:sync:remote -- --confirm <tag-count>
npm run check:cloudflare
```

Deploy only after reviewing the Worker configuration and environment:

```bash
npm run deploy
```

## Project layout

```text
app/                  UI, pages, and route handlers
db/                   Drizzle schema and D1 migrations
game-data/            reviewed STRAFTAT and tag catalogs
public/               static assets and normalized weapon images
scripts/              local and remote administration commands
src/application/      runtime-independent interfaces
src/domain/           product rules and validation
src/infrastructure/   D1, R2, and notification adapters
src/lib/              authentication, moderation, and helpers
tests/                unit and fresh-D1 integration tests
```

`AGENTS.md` and `.agents/skills/develop-straftat-presets/SKILL.md` contain maintenance instructions for coding agents. Package versions are exact-pinned and `package-lock.json` is committed for reproducible installs.
