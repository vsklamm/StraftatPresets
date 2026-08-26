import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const API = "https://straftat.wiki/api.php";
const STEAM_NEWS_API = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=2386720&count=20&maxlength=500&format=json";
const EXCLUDED_WEAPONS = new Set(["aboubihead", "aboubishead", "barrel", "cochin", "tubegun", "vehicles"]);
const WRITE = process.argv.includes("--write");

function normalizedKey(value) {
  return value.normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function slug(value) {
  return value.normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "StraftatPresets catalog updater (https://github.com/vsklamm)" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function wiki(parameters) {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ ...parameters, format: "json", formatversion: "2" })) url.searchParams.set(key, value);
  return getJson(url);
}

async function wikiPages(parameters, titles) {
  const pages = [];
  for (let index = 0; index < titles.length; index += 40) {
    const response = await wiki({ ...parameters, titles: titles.slice(index, index + 40).join("|") });
    if (response.error) throw new Error(`Wiki API: ${response.error.info}`);
    pages.push(...response.query.pages);
  }
  return pages;
}

function parseWeapons(wikitext) {
  const entries = [];
  const pattern = /\[\[File:([^|\]]+)[^\]]*\|link=([^\]]+)\]\]<br>\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/gi;
  for (const match of wikitext.matchAll(pattern)) {
    const [, file, linkName, visibleName] = match;
    if (linkName.trim() !== visibleName.trim()) throw new Error(`Weapon link/name mismatch: ${linkName} / ${visibleName}`);
    if (!EXCLUDED_WEAPONS.has(normalizedKey(visibleName))) entries.push({ name: visibleName.trim(), file: file.trim() });
  }
  return entries;
}

function parseMaps(wikitext) {
  const sections = [
    ["core", "== Core Maps ==", "== Alt Maps =="],
    ["alt", "== Alt Maps ==", "== DLC Maps =="],
    ["dlc", "== DLC Maps ==", "== Weapons on Each Map =="],
  ];
  return sections.flatMap(([kind, startHeading, endHeading]) => {
    const start = wikitext.indexOf(startHeading);
    const end = wikitext.indexOf(endHeading, start + startHeading.length);
    if (start < 0 || end < 0) throw new Error(`Missing map section: ${startHeading}`);
    const maps = [];
    for (const match of wikitext.slice(start, end).matchAll(/\[\[File:[^\]]+\|([^\]]+)\]\]/g)) {
      const name = match[1].split("|").at(-1)?.trim();
      if (name) maps.push({ name, kind });
    }
    return maps;
  });
}

function pageUrl(title) {
  return `https://straftat.wiki/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

function median(values) {
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

async function removeFlatBackground(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixelCount = width * height;
  const samples = [[], [], []];
  const borderBand = Math.max(2, Math.min(6, Math.floor(Math.min(width, height) / 100)));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= borderBand && x < width - borderBand && y >= borderBand && y < height - borderBand) continue;
      const offset = (y * width + x) * channels;
      for (let channel = 0; channel < 3; channel += 1) samples[channel].push(data[offset + channel]);
    }
  }

  const key = samples.map(median);
  const colorDistance = (pixel) => {
    const offset = pixel * channels;
    return Math.max(
      Math.abs(data[offset] - key[0]),
      Math.abs(data[offset + 1] - key[1]),
      Math.abs(data[offset + 2] - key[2]),
    );
  };
  const background = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  const addBackground = (pixel) => {
    if (background[pixel] || colorDistance(pixel) > 8) return;
    background[pixel] = 1;
    queue[queueEnd++] = pixel;
  };

  for (let x = 0; x < width; x += 1) {
    addBackground(x);
    addBackground((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    addBackground(y * width);
    addBackground(y * width + width - 1);
  }

  while (queueStart < queueEnd) {
    const pixel = queue[queueStart++];
    const x = pixel % width;
    if (x > 0) addBackground(pixel - 1);
    if (x + 1 < width) addBackground(pixel + 1);
    if (pixel >= width) addBackground(pixel - width);
    if (pixel + width < pixelCount) addBackground(pixel + width);
  }

  const alpha = new Uint8Array(pixelCount).fill(255);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) if (background[pixel]) alpha[pixel] = 0;

  let frontier = Array.from(queue.subarray(0, queueEnd));
  const softened = new Uint8Array(pixelCount);
  for (let depth = 0; depth < 3; depth += 1) {
    const next = [];
    for (const pixel of frontier) {
      const x = pixel % width;
      const neighbors = [x > 0 ? pixel - 1 : -1, x + 1 < width ? pixel + 1 : -1, pixel >= width ? pixel - width : -1, pixel + width < pixelCount ? pixel + width : -1];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || background[neighbor] || softened[neighbor]) continue;
        const distance = colorDistance(neighbor);
        if (distance >= 48) continue;
        softened[neighbor] = 1;
        alpha[neighbor] = Math.round(255 * smoothstep((distance - 8) / 40));
        next.push(neighbor);
      }
    }
    frontier = next;
  }

  const output = Buffer.alloc(pixelCount * 4);
  let transparentPixels = 0;
  let partialPixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const sourceOffset = pixel * channels;
    const outputOffset = pixel * 4;
    const outputAlpha = alpha[pixel];
    if (outputAlpha === 0) {
      transparentPixels += 1;
      output.fill(0, outputOffset, outputOffset + 4);
      continue;
    }
    if (outputAlpha < 255) partialPixels += 1;
    const opacity = outputAlpha / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const decontaminated = outputAlpha < 255 ? (data[sourceOffset + channel] - key[channel] * (1 - opacity)) / opacity : data[sourceOffset + channel];
      output[outputOffset + channel] = Math.round(Math.max(0, Math.min(255, decontaminated)));
    }
    output[outputOffset + 3] = outputAlpha;
  }

  const transparentRatio = transparentPixels / pixelCount;
  if (transparentRatio < 0.1 || transparentRatio > 0.999) throw new Error(`Suspicious background extraction (${(transparentRatio * 100).toFixed(1)}% transparent): ${inputPath}`);
  await sharp(output, { raw: { width, height, channels: 4 } }).webp({ quality: 86, alphaQuality: 100, effort: 4 }).toFile(outputPath);
  return { method: "border-connected-flat-v1", keyColor: `#${key.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`, transparentPixels, partialPixels };
}

async function main() {
  const [weaponsPage, mapsPage, revisions, steamNews] = await Promise.all([
    wiki({ action: "parse", page: "Weapons", prop: "wikitext" }),
    wiki({ action: "parse", page: "Maps", prop: "wikitext" }),
    wiki({ action: "query", prop: "revisions", rvprop: "ids|timestamp", titles: "Weapons|Maps|Versions and Patch-Notes" }),
    getJson(STEAM_NEWS_API),
  ]);

  const parsedWeapons = parseWeapons(weaponsPage.parse.wikitext);
  const maps = parseMaps(mapsPage.parse.wikitext);
  const imageTitles = parsedWeapons.map(({ file }) => `File:${file}`);
  const imagePages = await wikiPages({ action: "query", prop: "imageinfo", iiprop: "url|size|sha1|mime" }, imageTitles);

  const imagesByTitle = new Map(imagePages.map((page) => [normalizedKey(page.title), page.imageinfo?.[0]]));
  const revisionByTitle = new Map(revisions.query.pages.map((page) => [page.title, page.revisions?.[0]]));
  const latestRelease = steamNews.appnews.newsitems.find((item) => /^STRAFTAT \d+\.\d+\.\d+$/.test(item.title));
  if (!latestRelease) throw new Error("No STRAFTAT release found in official Steam news");

  const weapons = parsedWeapons.map(({ name, file }) => {
    const imageInfo = imagesByTitle.get(normalizedKey(`File:${file}`));
    if (!imageInfo || imageInfo.mime !== "image/png") throw new Error(`Missing original PNG for ${name} (${file})`);
    return { name, image: `/weapons/${slug(name)}.webp`, sourcePage: pageUrl(name), sourceFile: `File:${file}`, imageInfo };
  }).sort((left, right) => left.name.localeCompare(right.name));

  const releaseVersion = latestRelease.title.slice("STRAFTAT ".length);
  const releasePublishedAt = new Date(latestRelease.date * 1000).toISOString().slice(0, 10);
  const catalog = {
    schemaVersion: 1,
    supportedRelease: { version: releaseVersion, publishedAt: releasePublishedAt, sourceUrl: latestRelease.url },
    sources: {
      weapons: { url: "https://straftat.wiki/index.php?title=Weapons", revision: revisionByTitle.get("Weapons") },
      maps: { url: "https://straftat.wiki/wiki/Maps", revision: revisionByTitle.get("Maps") },
      versions: { url: "https://straftat.wiki/wiki/Versions_and_Patch-Notes", revision: revisionByTitle.get("Versions and Patch-Notes") },
    },
    weapons: weapons.map(({ name, image }) => ({ name, image })),
    maps: maps.sort((left, right) => left.name.localeCompare(right.name)),
  };
  const provenance = weapons.map(({ name, sourcePage, sourceFile, image, imageInfo }) => ({
    name,
    sourcePage,
    sourceFile,
    originalUrl: imageInfo.url,
    originalSha1: imageInfo.sha1,
    width: imageInfo.width,
    height: imageInfo.height,
    output: image,
  }));

  const uniqueWeapons = new Set(catalog.weapons.map(({ name }) => name));
  const uniqueMaps = new Set(catalog.maps.map(({ name }) => name));
  if (weapons.length !== 72 || uniqueWeapons.size !== 72) throw new Error(`Expected 72 unique weapons, found ${uniqueWeapons.size}`);
  if (maps.length !== 369 || uniqueMaps.size !== 369) throw new Error(`Expected 369 unique maps, found ${uniqueMaps.size}`);

  console.log(`STRAFTAT ${releaseVersion}: ${weapons.length} weapons, ${maps.length} maps`);
  if (!WRITE) {
    console.log("Dry run only. Re-run with --write to replace the reviewed catalog and weapon assets.");
    return;
  }

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "straftat-weapons-"));
  try {
    await mkdir("game-data/raw-weapons", { recursive: true });
    await mkdir("public/weapons", { recursive: true });
    for (const weapon of provenance) {
      const sourcePath = path.join(temporaryDirectory, `${slug(weapon.name)}.png`);
      const rawOutputPath = path.join("game-data", "raw-weapons", path.basename(weapon.output));
      const response = await fetch(weapon.originalUrl);
      if (!response.ok) throw new Error(`Could not download ${weapon.name}: ${response.status}`);
      await writeFile(sourcePath, Buffer.from(await response.arrayBuffer()));
      weapon.backgroundRemoval = await removeFlatBackground(sourcePath, rawOutputPath);
    }
    await writeFile("game-data/catalog.json", `${JSON.stringify(catalog, null, 2)}\n`);
    await writeFile("game-data/weapons.json", `${JSON.stringify({ schemaVersion: catalog.schemaVersion, supportedRelease: catalog.supportedRelease, weapons: catalog.weapons }, null, 2)}\n`);
    await writeFile("game-data/maps.json", `${JSON.stringify(catalog.maps, null, 2)}\n`);
    await writeFile("game-data/weapon-sources.json", `${JSON.stringify(provenance, null, 2)}\n`);
    console.log("Updated game-data/catalog.json, weapons.json, maps.json, weapon-sources.json, and raw weapon assets.");

    // Run optical normalization from raw assets into public/weapons
    const { execSync } = await import("node:child_process");
    execSync("npm run weapons:normalize", { stdio: "inherit" });
    console.log("Successfully normalized all weapon assets into public/weapons.");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
