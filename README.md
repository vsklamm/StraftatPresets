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
npm run db:schema           # generate a migration after changing db/schema.ts
npm run db:migrate          # apply migrations to local D1
npm run db:backup           # export D1 database to the ignored backups directory
npm run game:sync           # mirror the reviewed game catalog into local D1
npm run tags:sync           # mirror the reviewed tags into local D1
npm run search:rebuild        # rebuild the local published-preset search index
npm run search:rebuild:remote # rebuild the remote published-preset search index
npm run stats               # inspect the cached ranking (read-only)
npm run ranks:local         # local ranking table (read-only)
npm run ranks:prod          # production ranking table (read-only)
npm run stats -- local refresh-ranking # recalculate ranking without changing public counters
```

The `ranks:*` commands print each preset's cached total and category scores:
quality (completeness), engagement, freshness, surge, and lucky. The snapshot's
calculation time is printed above the table. These commands only read the ranking
cache, never recalculate scores or modify data. A missing cache is reported without
creating one. Production requires Wrangler authentication.

## Catalogs and assets

[`game-data/catalog.json`](game-data/catalog.json) is the reviewed source for the supported STRAFTAT release, map IDs, and canonical weapons. [`game-data/tags.json`](game-data/tags.json) is the reviewed public tag list. Browser and server validation use these same files, while D1 mirrors the data for indexed lookups and foreign-key checks.

Weapon images are metadata-free transparent WebP files in `public/weapons/`. To prepare a game update:

```bash
npm run game:update
npm run weapons:normalize
npm run game:sync
npm run check
```

Review all generated catalog and image changes before committing. Runtime requests never scrape the wiki.

Tag entries contain only `slug`, `label`, and `category`. Presets can use at most eight tags and gallery cards show at most five.

## Presets and moderation

Published presets require a name, a useful description, at least one version, at least one map playlist, and two to eight tags. Weapon settings are optional. Drafts are saved locally first and synchronized to D1 without replacing immutable submitted or published revisions.

Uploaded thumbnails are limited to JPEG or PNG input of at most 2 MB. The browser and server validate the file, the server converts it to WebP, and only the processed image is stored in private R2. New or changed thumbnails require manual review before publication.

Automatic profanity screening uses a secondary English library and reviewed high-confidence dictionaries for French, Spanish, German, Russian, Chinese, Arabic, Portuguese, Italian, Hindi, Japanese, and Korean. A small project dictionary also covers common transliterated Russian and Polish terms. English matches require review; non-English matches are rejected automatically.

Moderators can approve, reject, or retract presets directly via the Telegram bot integration.

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
npx wrangler d1 migrations apply DB --remote
npm run game:sync -- remote --confirm <supported-release>
npm run tags:sync -- remote --confirm <tag-count>
npm run check
```

Deploy only after reviewing the Worker configuration and environment:

```bash
npm run deploy
```

The v1.2.0 deploy command builds first, applies pending production D1 migrations,
recalculates ranking for every published preset using the production analytics
secret, and only then uploads the Worker. A failed migration or recalculation stops
the deployment. Do not bypass these steps with a direct `wrangler deploy`.
No event history, published content, thumbnails, or public counters are reset.

### Transport and browser security

At the next authorized rollout, enable Cloudflare **SSL/TLS → Edge Certificates →
Always Use HTTPS** for `straftatpresets.com`. HTTPS redirects belong at the edge,
covering static assets as well as application routes. The previous conditional
Next.js redirect produced a redirect loop on HTTPS in the deployed adapter despite
passing Next.js routing tests. Keep this redirect at the edge and verify real HTTP
and HTTPS responses after deployment.
After deployment, verify HTTP redirects for both `/` and a real `/_next/static/`
script URL, and check HTTPS pages for `Strict-Transport-Security` and
`Content-Security-Policy`. The deploy script does not change zone settings.
See [Cloudflare's HTTPS setup](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/).

The application adds host-only, one-year HSTS (no subdomain or preload opt-in)
and a CSP that restricts resource origins, framing, form targets, and inline event
handlers. Inline scripts and styles remain allowed for Next.js static hydration
and the existing UI, so this is **not a strict inline-XSS defense**. A nonce-based
policy would require revisiting rendering and caching. Local HTTP previews remain
usable, and development-only eval/WebSocket allowances are absent from builds.

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

## Acknowledgments

- **[STRAFTAT-Public](https://github.com/Lemaitre-Logiciels/STRAFTAT-Public)** by **Lemaitre Logiciels**: reference for game logic, interface behavior, and animation details used by this project.
- **[STRAFTOOLS](https://straftools.vercel.app/)** by **clodcan**: inspiration and reference for STRAFTAT preset structure, map playlist encoding, and tool UX.
- **[StraftatFX](https://matthewknorr.github.io/StraftatFX/)** by **Matthew Knorr** (`matthewknorr`): rich text color formatting concepts and text gradient tooling for STRAFTAT.
