# Third-party material

The root MIT license applies to material original to STRAFTATpresets. It does not relicense the material below. Keep its own notices and check its terms before redistributing it.

- `src/lib/moderation/level3-computery.ts` is a TypeScript adaptation of [ComputerysProfanityFilter](https://github.com/C0mputery/ComputerysProfanityFilter) by Christopher Rohland. The original is copyright 2026 Christopher Rohland and licensed under Apache-2.0. This file was ported and adapted for this project. See [the Apache-2.0 license](LICENSES/Apache-2.0.txt).
- `public/weapons/` and `game-data/raw-weapons/` contain processed STRAFTAT weapon images from the [Straftat Wiki](https://straftat.wiki/). Individual source files and processing details are recorded in [`game-data/weapon-sources.json`](game-data/weapon-sources.json). The wiki's file pages state CC BY 4.0 unless otherwise noted, which requires attribution and identification of changes. The images were background-removed, resized, and converted to WebP here. The underlying game artwork may involve separate rights, which this repository does not grant.
- `game-data/catalog.json` records STRAFTAT game names and data. Game-derived content is not covered by this project's MIT license.
- Game-derived imagery and screenshots in `public/`, including `architecture-relief*.webp`, `barrel.webp`, app icons, and `guide/` images, are not covered by MIT. The site credits background art to Rowan Hawkes. No general reuse permission for these assets is asserted here.
- `public/discord-symbol.svg` depicts a third-party mark. MIT does not grant trademark rights.
- The font files in `public/fonts/` retain their bundled SIL Open Font License notices (`OFL-Arimo.txt` and `OFL-Noto-Sans-Symbols-2.txt`).
- The provenance of the word-list data in `src/infrastructure/profanity-allowlist.ts` is not documented well enough to offer it under MIT. Treat that data as excluded until its sources are verified.

Installed npm packages are not relicensed by this repository. Their licenses are recorded in `package-lock.json` and their distributions. This includes the LGPL-3.0-or-later `libvips` binaries used by Sharp, whose conditions matter when redistributing binaries.

STRAFTAT-Public and STRAFTOOLS are credited as references, not presented as MIT-licensed source for this project. Their repositories do not currently provide a license granting general code reuse. Any verbatim code taken from them would require separate permission or removal before public redistribution.
