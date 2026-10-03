import { existsSync } from "node:fs";
import path from "node:path";
import { supportedGameRelease, supportedMapCount, supportedWeaponCount } from "../src/domain/game-catalog";

const STEAM_APP_ID = "2386720";
const STEAM_NEWS_API = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${STEAM_APP_ID}&count=5&maxlength=300&format=json`;

type SteamNewsItem = {
  gid: string;
  title: string;
  url: string;
  is_external_url: boolean;
  author: string;
  contents: string;
  feedlabel: string;
  date: number;
  feedname: string;
  feed_type: number;
  appid: number;
};

type UpdateCheckResult = {
  status: "up_to_date" | "update_available" | "check_failed";
  currentVersion: string;
  latestDetectedVersion: string | null;
  steamPatchTitle: string | null;
  steamPatchUrl: string | null;
  localRepoFound: boolean;
  actionRequired: boolean;
  message: string;
};

async function checkSteamReleases(): Promise<{ latestVersion: string | null; title: string | null; url: string | null }> {
  try {
    const res = await fetch(STEAM_NEWS_API, {
      headers: { "User-Agent": "STRAFTATpresets Release Auditor (https://straftatpresets.com)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { latestVersion: null, title: null, url: null };
    const data = (await res.json()) as { appnews?: { newsitems?: SteamNewsItem[] } };
    const news = data?.appnews?.newsitems ?? [];

    for (const item of news) {
      const match = item.title.match(/v?(\d+\.\d+\.\d+)/i) ?? item.contents.match(/v?(\d+\.\d+\.\d+)/i);
      if (match) {
        return { latestVersion: match[1], title: item.title, url: item.url };
      }
    }
  } catch {
    // Network or timeout failure gracefully caught
  }
  return { latestVersion: null, title: null, url: null };
}

function checkLocalGameRepo(): { found: boolean; repoPath: string | null } {
  const possiblePaths = [
    path.resolve(process.cwd(), "../STRAFTAT-Public"),
    path.resolve(process.env.HOME || "", "dev/STRAFTAT-Public"),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return { found: true, repoPath: p };
    }
  }
  return { found: false, repoPath: null };
}

async function main() {
  const { latestVersion, title, url } = await checkSteamReleases();
  const localRepo = checkLocalGameRepo();

  const isNewer = latestVersion && latestVersion !== supportedGameRelease.version;
  const status = isNewer ? "update_available" : "up_to_date";

  const result: UpdateCheckResult = {
    status,
    currentVersion: supportedGameRelease.version,
    latestDetectedVersion: latestVersion ?? supportedGameRelease.version,
    steamPatchTitle: title,
    steamPatchUrl: url,
    localRepoFound: localRepo.found,
    actionRequired: Boolean(isNewer),
    message: isNewer
      ? `New STRAFTAT update detected: ${latestVersion} (currently supporting ${supportedGameRelease.version}).`
      : `STRAFTAT catalog is fully up-to-date with version ${supportedGameRelease.version} (${supportedWeaponCount} weapons, ${supportedMapCount} maps).`,
  };

  console.log("=== STRAFTAT RELEASE AUDIT REPORT ===");
  console.log(`Current Supported Version : ${result.currentVersion}`);
  console.log(`Latest Steam Detected    : ${result.latestDetectedVersion ?? "Unknown"}`);
  console.log(`Catalog Weapons Count     : ${supportedWeaponCount}`);
  console.log(`Catalog Maps Count        : ${supportedMapCount}`);
  console.log(`Status                    : ${result.status.toUpperCase()}`);
  console.log(`Action Required           : ${result.actionRequired}`);
  console.log(`Message                   : ${result.message}`);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error("Update check encountered an unexpected error:", err);
  process.exit(1);
});
