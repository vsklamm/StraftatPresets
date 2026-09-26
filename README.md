# StraftatPresets

Share Map Playlists, Randomizer and Swapper settings for [STRAFTAT](https://store.steampowered.com/app/2386720/STRAFTAT/) — The Best Game You've Never Heard Of.

Made with <3 for the community. Find a setup for your next lobby, copy it into the game, or share your own.

[Browse presets](https://straftatpresets.com/) · [How to import](https://straftatpresets.com/how-to-import)

![The dashboard with community presets](.github/images/dashboard.webp)

![509's FFA preset with its description, map playlist and Swapper settings](.github/images/preset.webp)

## About the code

100% vibe-coded: built and maintained with AI coding agents, with a human directing and testing. Not designed as a hand-maintained codebase. Provided as-is. Review before self-hosting.

## Local setup

Node and npm versions are recorded in `.nvmrc` and `package.json`.

```bash
git clone <repository-url>
cd straftat_presets
nvm install
nvm use
npm install -g npm@12.0.2
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). D1 and R2 run locally, with persistent state in `.wrangler/`. Browsing and local APIs need no integration credentials.

For Discord login, copy `.env.example` to `.env.local`, set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`, and register this redirect:

```text
http://localhost:3000/api/auth/callback/discord
```

Local setup creates `NEXTAUTH_SECRET` if missing. Keep environment files untracked.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run check` | Validate catalogs, lint, types, tests and Worker build |
| `npm run preview` | Local Worker preview |
| `npm run db:schema` | Generate a migration after editing `db/schema.ts` |
| `npm run db:migrate` | Apply local migrations |
| `npm run db:backup` | Export D1 to ignored backups |
| `npm run game:sync` / `npm run tags:sync` | Sync reviewed catalogs to local D1 |
| `npm run search:rebuild` | Rebuild local published-preset search |
| `npm run search:rebuild:remote` | Rebuild production search |
| `npm run ranks:local` / `npm run ranks:prod` | Read cached ranking totals and category scores |
| `npm run stats -- local refresh-ranking` | Recalculate local ranking |

For a game update, run `npm run game:update`, `npm run weapons:normalize`, `npm run game:sync`, then `npm run check`. Review generated changes before committing.

## Self-hosting on Cloudflare

Create your own resources and update their bindings in `wrangler.jsonc`, including the D1 database ID. Do not use this project's production resources.

```bash
npx wrangler d1 create straftat-presets
npx wrangler r2 bucket create straftat-presets-thumbnails
npx wrangler r2 bucket create straftat-presets-thumbnails-preview
```

Copy `.env.production.example` to `.env.production` and fill it locally. Register `https://your-domain.example/api/auth/callback/discord` with Discord.

Initialize your remote database, replacing the confirmation placeholders with the values in `game-data/catalog.json` and `game-data/tags.json`:

```bash
npx wrangler d1 migrations apply DB --remote
npm run game:sync -- remote --confirm <supported-release>
npm run tags:sync -- remote --confirm <tag-count>
npm run check
npm run deploy
```

Deployment builds the Worker, applies migrations and recalculates published-preset ranking before uploading. Do not bypass it with `wrangler deploy`. Remote commands modify production data unless explicitly read-only.

Enable Cloudflare [Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/) for your domain. Check redirects, HSTS and CSP after deployment. The CSP allows inline scripts and styles, so it is not a strict inline-XSS defense.

## Technical overview

Next.js, React and TypeScript, deployed through OpenNext to Cloudflare Workers. D1 stores presets, private R2 stores thumbnails, Discord handles login, and Telegram supports moderation.

- `app/`: UI and API routes
- `src/domain/`: validation and product rules
- `src/application/`: interfaces
- `src/infrastructure/`: persistence and notifications
- `db/`: schema and migrations
- `game-data/`: reviewed map, weapon and tag catalogs
- `scripts/`: maintenance commands
- `tests/`: unit and local D1 integration tests

Drafts save locally first. Submitted and published revisions are immutable. Thumbnails are processed to WebP and reviewed before publication. Preset text is screened automatically, with Telegram moderation for review.

[AGENTS.md](AGENTS.md) contains the entry point for coding-agent maintenance instructions.

## Acknowledgements

- [STRAFTAT-Public](https://github.com/Lemaitre-Logiciels/STRAFTAT-Public) by Lemaitre Logiciels — game logic and UI reference.
- [STRAFTOOLS](https://straftools.vercel.app/) by clodcan — preset structure, map playlist encoding and tool UX.
- [StraftatFX](https://matthewknorr.github.io/StraftatFX/) by Matthew Knorr — rich text colors and gradients.

## License

Original project code is [MIT-licensed](LICENSE). Game assets and other third-party material have separate terms. See [third-party notices](THIRD_PARTY_NOTICES.md).
